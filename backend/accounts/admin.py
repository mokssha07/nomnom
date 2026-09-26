from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CanteenUserAdmin(UserAdmin):
    # The stock UserAdmin doesn't know about our extra fields, so role could
    # never be changed from /admin/ — which is the only way to create staff.
    fieldsets = UserAdmin.fieldsets + (
        ("Canteen", {"fields": ("role", "roll_number", "phone_number")}),
    )
    list_display = ("username", "role", "roll_number", "email", "is_staff")
    list_filter = ("role",) + UserAdmin.list_filter
