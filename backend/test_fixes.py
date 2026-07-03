import sys
sys.path.insert(0, r'c:\Users\user\Documents\GitHub\IA_proyecto\backend')
from pathlib import Path
from services.hotel_service import HotelService

hs = HotelService(Path(r'c:\Users\user\Documents\GitHub\IA_proyecto\backend\data\dashboard.csv'))

print("=== catalog_clases ===")
print(hs.catalog_clases)

print("\n=== location_tree keys ===")
keys = list(hs.location_tree.keys())
print(keys)

print("\n=== ANCASH key check ===")
ancash_keys = [k for k in keys if 'NCASH' in k]
print("Ancash keys:", ancash_keys)
if ancash_keys:
    ak = ancash_keys[0]
    print("Provincias de Ancash:", list(hs.location_tree[ak].keys())[:5])
