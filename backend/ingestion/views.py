from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import DataSource, EmissionRecord
from .serializers import EmissionRecordDetailSerializer, EmissionRecordListSerializer, ReviewActionSerializer
from .services import ingest_csv, transition_record, update_comment


def tenant_slug_from_request(request):
    return request.headers.get("X-Tenant", request.query_params.get("tenant", "demo"))


def upload_for_source(request, source_type):
    uploaded = request.FILES.get("file")
    if not uploaded:
        return Response({"detail": "CSV file is required as multipart field 'file'."}, status=status.HTTP_400_BAD_REQUEST)
    result = ingest_csv(uploaded, source_type=source_type, tenant_slug=tenant_slug_from_request(request))
    return Response(
        {
            "batch_id": str(result["batch_id"]),
            "created_count": result["created_count"],
            "record_ids": [record.id for record in result["records"]],
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
def upload_sap(request):
    return upload_for_source(request, DataSource.SourceType.SAP)


@api_view(["POST"])
def upload_utility(request):
    return upload_for_source(request, DataSource.SourceType.UTILITY)


@api_view(["POST"])
def upload_travel(request):
    return upload_for_source(request, DataSource.SourceType.TRAVEL)


@api_view(["GET"])
def records(request):
    queryset = EmissionRecord.objects.select_related("data_source").annotate(issue_count=Count("validation_issues"))
    tenant_slug = tenant_slug_from_request(request)
    queryset = queryset.filter(tenant__slug=tenant_slug)
    if source := request.query_params.get("source"):
        queryset = queryset.filter(data_source__source_type=source)
    if scope := request.query_params.get("scope"):
        queryset = queryset.filter(scope=scope)
    if record_status := request.query_params.get("status"):
        queryset = queryset.filter(status=record_status)
    serializer = EmissionRecordListSerializer(queryset, many=True)
    return Response(serializer.data)


@api_view(["GET"])
def record_detail(request, pk):
    record = get_object_or_404(
        EmissionRecord.objects.select_related("data_source", "raw_record").prefetch_related("validation_issues", "audit_logs"),
        pk=pk,
        tenant__slug=tenant_slug_from_request(request),
    )
    return Response(EmissionRecordDetailSerializer(record).data)


@api_view(["POST"])
def approve_record(request, pk):
    serializer = ReviewActionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    record = get_object_or_404(EmissionRecord, pk=pk, tenant__slug=tenant_slug_from_request(request))
    try:
        updated = transition_record(record, "approve", user=request.user, comment=serializer.validated_data.get("comment", ""))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    return Response(EmissionRecordDetailSerializer(updated).data)


@api_view(["POST"])
def reject_record(request, pk):
    serializer = ReviewActionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    record = get_object_or_404(EmissionRecord, pk=pk, tenant__slug=tenant_slug_from_request(request))
    try:
        updated = transition_record(record, "reject", user=request.user, comment=serializer.validated_data.get("comment", ""))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    return Response(EmissionRecordDetailSerializer(updated).data)


@api_view(["POST"])
def comment_record(request, pk):
    serializer = ReviewActionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    record = get_object_or_404(EmissionRecord, pk=pk, tenant__slug=tenant_slug_from_request(request))
    try:
        updated = update_comment(record, user=request.user, comment=serializer.validated_data.get("comment", ""))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    return Response(EmissionRecordDetailSerializer(updated).data)


@api_view(["POST"])
def lock_record(request, pk):
    serializer = ReviewActionSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    record = get_object_or_404(EmissionRecord, pk=pk, tenant__slug=tenant_slug_from_request(request))
    try:
        updated = transition_record(record, "lock", user=request.user, comment=serializer.validated_data.get("comment", ""))
    except ValueError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)
    return Response(EmissionRecordDetailSerializer(updated).data)


@api_view(["GET"])
def dashboard(request):
    tenant_slug = tenant_slug_from_request(request)
    queryset = EmissionRecord.objects.filter(tenant__slug=tenant_slug)
    by_status = queryset.values("status").annotate(count=Count("id"))
    by_scope = queryset.values("scope").annotate(count=Count("id"))
    by_source = queryset.values("data_source__source_type").annotate(count=Count("id"))
    suspicious = queryset.filter(validation_issues__isnull=False).distinct().count()
    return Response(
        {
            "total_records": queryset.count(),
            "pending_review": queryset.filter(status=EmissionRecord.Status.PENDING).count(),
            "approved": queryset.filter(status=EmissionRecord.Status.APPROVED).count(),
            "rejected": queryset.filter(status=EmissionRecord.Status.REJECTED).count(),
            "suspicious": suspicious,
            "by_status": list(by_status),
            "by_scope": list(by_scope),
            "by_source": list(by_source),
        }
    )
