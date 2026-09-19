from django.db import models
from counters.models import Counter


class Category(models.Model):
    name = models.CharField(max_length=100)
    display_order = models.IntegerField(default=0)

    class Meta:
        ordering = ['display_order']

    def __str__(self):
        return self.name


class MenuItem(models.Model):
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=8, decimal_places=2)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='items')
    counter = models.ForeignKey(Counter, on_delete=models.CASCADE, related_name='items')
    stock_quantity = models.IntegerField(null=True, blank=True)
    low_stock_threshold = models.IntegerField(default=5)
    is_available = models.BooleanField(default=True)
    image = models.ImageField(upload_to='menu/', blank=True, null=True)
    low_stock_alert_sent_at = models.DateTimeField(null=True, blank=True)

    def is_orderable(self):
        if not self.is_available:
            return False
        if self.stock_quantity is None:
            return True
        return self.stock_quantity > 0

    def __str__(self):
        return self.name