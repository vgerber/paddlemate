"""Tests for the photo source table of build_seed.py.

    python3 -I scripts/materials/test_build_seed.py
"""

import doctest
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_seed as b


class PhotoSource(unittest.TestCase):
    def test_maker_page_credits_the_brand(self):
        self.assertEqual(b.photo_source("https://pyranha.com/products/x", "Pyranha"), ("maker", "Pyranha"))

    def test_group_owner_credits_the_brand(self):
        url = "https://www.confluenceoutdoor.com/products/dagger-x"
        self.assertEqual(b.photo_source(url, "Dagger"), ("maker", "Dagger"))

    def test_archived_maker_page(self):
        url = "https://web.archive.org/web/2018/http://www.aire.com:80/aire-kayak/force.asp"
        self.assertEqual(b.photo_source(url, "AIRE"), ("maker", "AIRE"))

    def test_shop_page_credits_the_shop(self):
        self.assertEqual(b.photo_source("https://store.noc.com/products/w", "Werner"), ("retailer", "NOC"))
        self.assertEqual(b.photo_source("https://www.kayak-shop.eu/en/x/", "Zet"), ("retailer", "kayak-shop.eu"))
        self.assertEqual(b.photo_source("https://wildernesssupply.ca/a", "Dagger"), ("retailer", "Wilderness Supply"))

    def test_a_shop_that_is_the_maker(self):
        self.assertEqual(b.photo_source("https://www.nrs.com/x", "NRS"), ("maker", "NRS"))
        self.assertEqual(b.photo_source("https://www.nrs.com/x", "Werner"), ("retailer", "NRS"))

    def test_unknown_host_is_refused(self):
        with self.assertRaises(SystemExit):
            b.photo_source("https://playak.com/buyers-guide/x", "AIRE")

    def test_every_photo_in_the_data_has_a_source(self):
        for row in b.build():
            for image in row["images"]:
                self.assertNotIn("playak.com", image["url"] + image["page_url"])
                self.assertIn(image["kind"], ("maker", "retailer"))

    def test_the_seed_and_the_migration_are_stable(self):
        rows = b.build()
        self.assertEqual(b.render(rows), b.render(b.build()))
        self.assertEqual(b.render_photo_migration("photos-1102", swap=True),
                         b.render_photo_migration("photos-1102", swap=True))


def load_tests(loader, tests, ignore):
    tests.addTests(doctest.DocTestSuite(b))
    return tests


if __name__ == "__main__":
    unittest.main()
