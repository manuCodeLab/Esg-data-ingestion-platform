from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def root(_request):
    return JsonResponse({
        "message": "ESG ingestion backend is running.",
        "api": "/api/",
        "frontend": "http://localhost:5173/",
    })


urlpatterns = [
    path("", root),
    path("admin/", admin.site.urls),
    path("api/", include("ingestion.urls")),
]
