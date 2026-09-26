from rest_framework import generics, status, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from django.db import IntegrityError
from django.shortcuts import get_object_or_404
from counters.models import Counter
from .models import Order
from .serializers import OrderSerializer, PlaceOrderSerializer
from .services import (
    place_order, update_order_status, cancel_order,
    InsufficientStockError, InvalidOrderError, InvalidTransitionError,
)

NOT_FOUND = {"error": "not_found", "detail": "Order not found."}


class OrderListCreateView(generics.ListCreateAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.role in ("staff", "manager"):
            qs = Order.objects.all()
            counter_id = self.request.query_params.get("counter")
            status_param = self.request.query_params.get("status")
            if counter_id:
                qs = qs.filter(counter_id=counter_id)
            if status_param:
                qs = qs.filter(status__in=status_param.split(","))
            return qs
        return Order.objects.filter(student=user)

    def create(self, request, *args, **kwargs):
        body = PlaceOrderSerializer(data=request.data)
        if not body.is_valid():
            return Response(
                {"error": "invalid_request", "detail": "Invalid order request.", "fields": body.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        data = body.validated_data
        counter = get_object_or_404(Counter, id=data["counter_id"])
        args = (request.user, counter, data["items"], data["idempotency_key"])

        try:
            try:
                order = place_order(*args)
            except IntegrityError:
                # Two requests with the same key raced; the other one won.
                # Running again finds its order and returns that instead.
                order = place_order(*args)
        except InsufficientStockError as e:
            return Response(
                {"error": "insufficient_stock", "detail": e.message, "item_id": e.item_id},
                status=status.HTTP_400_BAD_REQUEST
            )
        except InvalidOrderError as e:
            return Response({"error": "invalid_order", "detail": str(e)},
                            status=status.HTTP_400_BAD_REQUEST)

        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


class OrderDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        order = get_object_or_404(Order, id=pk)
        is_staff = request.user.role in ("staff", "manager")
        if not is_staff and order.student_id != request.user.id:
            # 404 rather than 403, so students can't probe which order IDs exist
            return Response(NOT_FOUND, status=404)
        return Response(OrderSerializer(order).data)

    def delete(self, request, pk):
        try:
            order = cancel_order(pk, request.user)
        except Order.DoesNotExist:
            return Response(NOT_FOUND, status=404)
        except InvalidTransitionError as e:
            return Response({"error": "cannot_cancel", "detail": str(e)}, status=400)
        except PermissionError as e:
            return Response({"error": "forbidden", "detail": str(e)}, status=403)
        return Response({"id": order.id, "status": order.status})


class OrderStatusUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        if request.user.role not in ("staff", "manager"):
            return Response({"error": "forbidden", "detail": "Only staff can update status."}, status=403)
        try:
            order = update_order_status(pk, request.data.get("status"), request.user)
        except Order.DoesNotExist:
            return Response(NOT_FOUND, status=404)
        except InvalidTransitionError as e:
            return Response({"error": "invalid_transition", "detail": str(e)}, status=400)
        return Response(OrderSerializer(order).data)