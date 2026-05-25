from django.urls import path

from . import views


urlpatterns = [
    path("upload/sap", views.upload_sap),
    path("upload/utility", views.upload_utility),
    path("upload/travel", views.upload_travel),
    path("records", views.records),
    path("records/<int:pk>", views.record_detail),
    path("records/<int:pk>/approve", views.approve_record),
    path("records/<int:pk>/reject", views.reject_record),
    path("records/<int:pk>/comment", views.comment_record),
    path("records/<int:pk>/lock", views.lock_record),
    path("dashboard", views.dashboard),
]
