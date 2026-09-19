from rest_framework import serializers
from .models import Category, MenuItem


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'display_order']


class MenuItemSerializer(serializers.ModelSerializer):
    category = CategorySerializer(read_only=True)
    counter = serializers.SerializerMethodField()
    is_orderable = serializers.SerializerMethodField()

    class Meta:
        model = MenuItem
        fields = ['id', 'name', 'description', 'price', 'category', 'counter',
                  'stock_quantity', 'is_available', 'is_orderable', 'image']

    def get_counter(self, obj):
        return {"id": obj.counter.id, "name": obj.counter.name, "slug": obj.counter.slug}

    def get_is_orderable(self, obj):
        return obj.is_orderable()