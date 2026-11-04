"""Rewrites numbers, units, and common English terms as Thai words, so the Thai voice reads them clearly."""
import re

DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"]
PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"]

LETTERS = {
    "A": "เอ", "B": "บี", "C": "ซี", "D": "ดี", "E": "อี", "F": "เอฟ", "G": "จี",
    "H": "เอช", "I": "ไอ", "J": "เจ", "K": "เค", "L": "แอล", "M": "เอ็ม", "N": "เอ็น",
    "O": "โอ", "P": "พี", "Q": "คิว", "R": "อาร์", "S": "เอส", "T": "ที", "U": "ยู",
    "V": "วี", "W": "ดับเบิลยู", "X": "เอ็กซ์", "Y": "วาย", "Z": "แซด",
}

# Units that follow a number. Longer names come first, so "GiB" wins over "G".
UNITS = [
    (r"%", "เปอร์เซ็นต์"),
    (r"°\s?C", "องศาเซลเซียส"),
    (r"TiB|TB", "เทราไบต์"),
    (r"GiB|GB", "กิกะไบต์"),
    (r"MiB|MB", "เมกะไบต์"),
    (r"KiB|KB", "กิโลไบต์"),
    (r"GHz", "กิกะเฮิรตซ์"),
    (r"MHz", "เมกะเฮิรตซ์"),
    (r"Mbps", "เมกะบิตต่อวินาที"),
    (r"ms", "มิลลิวินาที"),
    (r"fps|FPS", "เฟรมต่อวินาที"),
    (r"W", "วัตต์"),
]

# English terms that appear in Shiro's replies. Matching ignores case.
TERMS = [
    ("VS Code", "วีเอสโค้ด"),
    ("VSCode", "วีเอสโค้ด"),
    ("PowerShell", "พาวเวอร์เชลล์"),
    ("Windows", "วินโดวส์"),
    ("Chrome", "โครม"),
    ("Discord", "ดิสคอร์ด"),
    ("Steam", "สตีม"),
    ("Spotify", "สปอติฟาย"),
    ("Notepad", "โน้ตแพด"),
    ("Wi-Fi", "ไวไฟ"),
    ("WiFi", "ไวไฟ"),
    ("VRAM", "วีแรม"),
    ("RAM", "แรม"),
    ("OK", "โอเค"),
    ("Gaming Mode", "โหมดเล่นเกม"),
]

UNIT_PATTERN = "|".join(f"(?:{pattern})" for pattern, _ in UNITS)
NUMBER_RE = re.compile(
    rf"(?<![A-Za-z0-9.])(-?)(\d{{1,3}}(?:,\d{{3}})+|\d+)(?:\.(\d+))?(?:\s?({UNIT_PATTERN}))?(?![A-Za-z])"
)
TIME_RE = re.compile(r"(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)(\s?น\.)?")
ACRONYM_RE = re.compile(r"(?<![A-Za-z])[A-Z]{1,5}(?![A-Za-z])")
THAI_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")


def _below_million(number):
    words = []
    digits = str(number)
    for index, digit in enumerate(digits):
        value = int(digit)
        place = len(digits) - index - 1
        if value == 0:
            continue
        if place == 1 and value == 1:
            words.append("สิบ")
        elif place == 1 and value == 2:
            words.append("ยี่สิบ")
        elif place == 0 and value == 1 and number > 10:
            words.append("เอ็ด")
        else:
            words.append(DIGITS[value] + PLACES[place])
    return "".join(words)


def number_to_thai(number):
    """Reads a whole number in Thai, for example 21 as "ยี่สิบเอ็ด" and 1500000 as "หนึ่งล้านห้าแสน"."""
    if number == 0:
        return DIGITS[0]
    if number < 0:
        return "ลบ" + number_to_thai(-number)
    millions, rest = divmod(number, 1_000_000)
    words = _below_million(rest)
    if millions:
        words = number_to_thai(millions) + "ล้าน" + words
    return words


def _unit_words(unit):
    for pattern, words in UNITS:
        if re.fullmatch(pattern, unit):
            return words
    return ""


def _read_number(match):
    sign, whole, fraction, unit = match.groups()
    words = number_to_thai(int(whole.replace(",", "")))
    if sign:
        words = "ลบ" + words
    if fraction:
        words += "จุด" + "".join(DIGITS[int(digit)] for digit in fraction)
    if unit:
        words += _unit_words(unit)
    return words


def _read_time(match):
    hours, minutes, _ = match.groups()
    words = number_to_thai(int(hours)) + "นาฬิกา"
    if int(minutes):
        words += number_to_thai(int(minutes)) + "นาที"
    return words


def normalize_for_speech(text):
    """Returns text that a Thai voice reads clearly: numbers, times, units, and known terms become Thai words."""
    text = text.translate(THAI_DIGITS)
    for term, words in TERMS:
        text = re.sub(rf"(?<![A-Za-z]){re.escape(term)}(?![A-Za-z])", words, text, flags=re.IGNORECASE)
    text = TIME_RE.sub(_read_time, text)
    text = NUMBER_RE.sub(_read_number, text)
    text = ACRONYM_RE.sub(lambda match: "".join(LETTERS[letter] for letter in match.group()), text)
    return re.sub(r" +", " ", text).strip()
