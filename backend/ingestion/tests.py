from decimal import Decimal

from django.test import SimpleTestCase

from .models import EmissionRecord
from .services import normalize_sap, normalize_travel, normalize_utility, validate_sap, validate_travel, validate_utility


class NormalizationTests(SimpleTestCase):
    def test_utility_mwh_normalizes_to_kwh(self):
        normalized = normalize_utility({"Consumption": "12.5", "Unit": "MWh"})

        self.assertEqual(normalized.quantity, Decimal("12500.0"))
        self.assertEqual(normalized.unit, "kWh")
        self.assertEqual(normalized.scope, EmissionRecord.Scope.SCOPE_2)

    def test_sap_diesel_maps_to_scope_one(self):
        normalized = normalize_sap({"Fuel Type": "Diesel", "Quantity": "100", "Unit": "KL", "Plant Code": "P01"})

        self.assertEqual(normalized.quantity, Decimal("100000"))
        self.assertEqual(normalized.unit, "L")
        self.assertEqual(normalized.scope, EmissionRecord.Scope.SCOPE_1)

    def test_travel_miles_normalizes_to_kilometers(self):
        normalized = normalize_travel({"Trip Type": "Flight", "Distance": "100", "Unit": "mi", "Origin": "JFK", "Destination": "SFO"})

        self.assertEqual(normalized.quantity, Decimal("160.93400"))
        self.assertEqual(normalized.unit, "km")
        self.assertEqual(normalized.scope, EmissionRecord.Scope.SCOPE_3)


class ValidationTests(SimpleTestCase):
    def test_fuel_negative_quantity_and_missing_plant_are_flagged(self):
        normalized = normalize_sap({"Fuel Type": "Diesel", "Quantity": "-5", "Unit": "L"})
        codes = {issue[0] for issue in validate_sap({}, normalized)}

        self.assertIn("fuel_negative_quantity", codes)
        self.assertIn("fuel_missing_plant_code", codes)

    def test_utility_missing_period_and_high_consumption_are_flagged(self):
        normalized = normalize_utility({"Consumption": "900", "Unit": "MWh"})
        codes = {issue[0] for issue in validate_utility({}, normalized)}

        self.assertIn("electricity_unusually_high", codes)
        self.assertIn("electricity_missing_billing_period", codes)

    def test_travel_missing_route_and_zero_distance_are_flagged(self):
        normalized = normalize_travel({"Trip Type": "Flight", "Distance": "0", "Unit": "km"})
        codes = {issue[0] for issue in validate_travel({}, normalized)}

        self.assertIn("travel_missing_route", codes)
        self.assertIn("travel_zero_distance", codes)
