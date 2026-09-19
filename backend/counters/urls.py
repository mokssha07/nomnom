from django.urls import path
from .views import CounterListView

urlpatterns = [
    path('', CounterListView.as_view()),
]