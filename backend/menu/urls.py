from django.urls import path
from .views import CategoryListView, MenuItemListView, MenuItemDetailView

urlpatterns = [
    path('categories/', CategoryListView.as_view()),
    path('items/', MenuItemListView.as_view()),
    path('items/<int:pk>/', MenuItemDetailView.as_view()),
]
