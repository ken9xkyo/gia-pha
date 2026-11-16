from datetime import date

from app.lunar import (
    anniversary_in_year,
    can_chi_year,
    leap_month_of_year,
    lunar_to_solar,
    next_anniversary,
    solar_to_lunar,
)


def test_tet_dates():
    ld = solar_to_lunar(date(2025, 1, 29))
    assert (ld.day, ld.month, ld.year, ld.leap) == (1, 1, 2025, False)
    ld =solar_to_lunar(date(2024, 2, 10))
    assert (ld.day, ld.month, ld.year, ld.leap) == (1, 1, 2024, False)
    assert lunar_to_solar(1, 1, 2026) == date(2026, 2, 17)


def test_vietnam_timezone_differs_from_china():
    # Tết Ất Sửu 1985: Việt Nam (UTC+7) đón 21/1, Trung Quốc (UTC+8) đón 20/2
    ld = solar_to_lunar(date(1985, 1, 21))
    assert (ld.day, ld.month, ld.year) == (1, 1, 1985)


def test_leap_months():
    assert leap_month_of_year(2023) == 2
    assert leap_month_of_year(2025) == 6
    assert leap_month_of_year(2024) is None
    assert lunar_to_solar(1, 2, 2023, leap=True) == date(2023, 3, 22)
    ld = solar_to_lunar(date(2025, 7, 25))
    assert (ld.day, ld.month, ld.leap) == (1, 6, True)
    # Tháng nhuận không tồn tại
    assert lunar_to_solar(1, 3, 2023, leap=True) is None


def test_round_trip_many_days():
    d = date(1950, 1, 1)
    for _ in range(0, 365 * 80, 7):
        ld = solar_to_lunar(d)
        assert lunar_to_solar(ld.day, ld.month, ld.year, ld.leap) == d
        d = date.fromordinal(d.toordinal() + 7)


def test_anniversary_day_30_falls_back_to_29():
    # Tháng chạp năm Giáp Thìn 2024 là tháng thiếu (29 ngày)
    result = anniversary_in_year(12, 30, 2024)
    assert solar_to_lunar(result).day == 29


def test_next_anniversary_and_can_chi():
    # Giỗ Tổ Hùng Vương 10/3
    assert next_anniversary(3, 10, date(2026, 11, 15)) == date(2027, 4, 16)
    assert can_chi_year(2025) == "Ất Tỵ"
    assert can_chi_year(1880) == "Canh Thìn"
