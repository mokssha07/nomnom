from rest_framework import generics
from .models import Counter
from .serializers import CounterSerializer


class CounterListView(generics.ListAPIView):
    queryset = Counter.objects.all()
    serializer_class = CounterSerializer