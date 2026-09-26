from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate, get_user_model
from .serializers import RegisterSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    throttle_scope = 'auth'

    def create(self, request, *args, **kwargs):
        roll_number = request.data.get('roll_number')
        if roll_number and User.objects.filter(roll_number=roll_number).exists():
            return Response(
                {"error": "roll_number_taken", "detail": "This roll number is already registered."},
                status=status.HTTP_400_BAD_REQUEST
            )
        response = super().create(request, *args, **kwargs)
        # Hand back a token straight away. Making the client log in next costs a
        # second password hash (~0.8s each at Django's default strength).
        user = User.objects.get(username=response.data['username'])
        token, _ = Token.objects.get_or_create(user=user)
        response.data.update({"token": token.key, "role": user.role, "user_id": user.id})
        return response


class LoginView(APIView):
    throttle_scope = 'auth'

    def post(self, request):
        user = authenticate(username=request.data.get('username'), password=request.data.get('password'))
        if not user:
            return Response(
                {"error": "invalid_credentials", "detail": "Username or password is incorrect."},
                status=status.HTTP_401_UNAUTHORIZED
            )
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "role": user.role, "user_id": user.id})


class LogoutView(APIView):
    """Deletes the token on the server, so a copied token stops working too."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request.auth.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
