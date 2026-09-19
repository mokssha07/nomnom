from rest_framework import generics
from .models import Category, MenuItem
from .serializers import CategorySerializer, MenuItemSerializer


class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class MenuItemListView(generics.ListAPIView):
    serializer_class = MenuItemSerializer

    def get_queryset(self):
        qs = MenuItem.objects.all()
        category = self.request.query_params.get('category')
        counter = self.request.query_params.get('counter')
        if category:
            qs = qs.filter(category_id=category)
        if counter:
            qs = qs.filter(counter_id=counter)
        return qs


class MenuItemDetailView(generics.RetrieveAPIView):
    queryset = MenuItem.objects.all()
    serializer_class = MenuItemSerializer