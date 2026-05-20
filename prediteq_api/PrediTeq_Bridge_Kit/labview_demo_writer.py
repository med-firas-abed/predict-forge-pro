"""
LabVIEW demo CSV writer for the cross-platform bridge kit.

This is a jury-friendly alias around the existing CSV writer so the relay-PC
demo path can be presented as a LabVIEW-style CSV bridge without changing the
bridge behavior.
"""

from fake_csv_writer import main


if __name__ == "__main__":
    raise SystemExit(main())
