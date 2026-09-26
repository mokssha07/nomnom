from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .models import User


class RegisterAndLoginTest(TestCase):
    def setUp(self):
        cache.clear()   # throttle counts live in the cache
        self.client = APIClient()

    def register(self, **overrides):
        body = {"username": "riya", "password": "Canteen#Test2026", "roll_number": "CS1",
                "email": "riya@college.test", **overrides}
        return self.client.post("/api/auth/register/", body, format="json")

    def test_register_returns_a_working_token_and_student_role(self):
        r = self.register()
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["role"], "student")
        self.assertNotIn("password", r.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {r.data['token']}")
        self.assertEqual(self.client.get("/api/orders/").status_code, 200)

    def test_weak_passwords_are_rejected(self):
        for weak in ("1", "password", "12345678", "riya1234"):
            r = self.register(password=weak, username=f"u{weak}", roll_number=f"R{weak}")
            self.assertEqual(r.status_code, 400, weak)
            self.assertIn("password", r.data)
        self.assertEqual(User.objects.count(), 0)

    def test_cannot_self_register_as_staff(self):
        r = self.register(role="staff")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(User.objects.get(username="riya").role, "student")

    def test_login_is_rate_limited(self):
        self.register()
        cache.clear()   # registering counts toward the same limit
        codes = [self.client.post("/api/auth/login/", {"username": "riya", "password": "wrong"},
                                  format="json").status_code for _ in range(10)]
        self.assertEqual(set(codes), {401})
        r = self.client.post("/api/auth/login/", {"username": "riya", "password": "Canteen#Test2026"},
                             format="json")
        self.assertEqual(r.status_code, 429)
