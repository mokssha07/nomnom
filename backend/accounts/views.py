from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate, get_user_model
from .serializers import RegisterSerializer

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        roll_number = request.data.get('roll_number')
        if roll_number and User.objects.filter(roll_number=roll_number).exists():
            return Response(
                {"error": "roll_number_taken", "detail": "This roll number is already registered."},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().create(request, *args, **kwargs)


class LoginView(APIView):
    def post(self, request):
        user = authenticate(username=request.data.get('username'), password=request.data.get('password'))
        if not user:
            return Response(
                {"error": "invalid_credentials", "detail": "Username or password is incorrect."},
                status=status.HTTP_401_UNAUTHORIZED
            )
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "role": user.role, "user_id": user.id})