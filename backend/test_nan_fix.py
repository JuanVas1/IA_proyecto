import sys, math, json
sys.path.insert(0, r'c:\Users\user\Documents\GitHub\IA_proyecto\backend')
from pathlib import Path
from services.hotel_service import HotelService

hs = HotelService(Path(r'c:\Users\user\Documents\GitHub\IA_proyecto\backend\data\dashboard.csv'))
result = hs.get_hoteles()

def check_nan(obj, path=''):
    found = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            found += check_nan(v, path + '.' + str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            found += check_nan(v, path + '[' + str(i) + ']')
    elif isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        found.append(path)
    return found

nans = check_nan(result)
if nans:
    print("NaN/Inf found at:", nans[:5])
else:
    print("No NaN/Inf found!")

try:
    s = json.dumps(result)
    total = result['total']
    print(f"JSON OK ({len(s)} bytes), total hoteles: {total}")
except Exception as e:
    print(f"JSON error: {e}")
