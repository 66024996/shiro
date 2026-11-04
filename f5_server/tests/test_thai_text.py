import unittest

from thai_text import normalize_for_speech, number_to_thai


class NumberToThaiTests(unittest.TestCase):
    def test_reads_whole_numbers(self):
        cases = {
            0: "ศูนย์",
            1: "หนึ่ง",
            10: "สิบ",
            11: "สิบเอ็ด",
            21: "ยี่สิบเอ็ด",
            41: "สี่สิบเอ็ด",
            101: "หนึ่งร้อยเอ็ด",
            2026: "สองพันยี่สิบหก",
            1_500_000: "หนึ่งล้านห้าแสน",
            -5: "ลบห้า",
        }
        for number, words in cases.items():
            with self.subTest(number=number):
                self.assertEqual(number_to_thai(number), words)


class NormalizeForSpeechTests(unittest.TestCase):
    def test_reads_numbers_with_units_and_terms(self):
        cases = {
            "แรมเหลือ 0.3GiB ค่ะ": "แรมเหลือ ศูนย์จุดสามกิกะไบต์ ค่ะ",
            "ไดรฟ์ D เหลือ 41 GB ค่ะ": "ไดรฟ์ ดี เหลือ สี่สิบเอ็ดกิกะไบต์ ค่ะ",
            "CPU ใช้อยู่ 35% ค่ะ": "ซีพียู ใช้อยู่ สามสิบห้าเปอร์เซ็นต์ ค่ะ",
            "GPU ร้อน 72°C ค่ะ": "จีพียู ร้อน เจ็ดสิบสององศาเซลเซียส ค่ะ",
            "ตอนนี้ 14:05 น. ค่ะ": "ตอนนี้ สิบสี่นาฬิกาห้านาที ค่ะ",
            "เปิด VS Code ให้แล้วค่ะ": "เปิด วีเอสโค้ด ให้แล้วค่ะ",
            "เหลือ1,024MBค่ะ": "เหลือหนึ่งพันยี่สิบสี่เมกะไบต์ค่ะ",
            "มี ๓ ไฟล์ค่ะ": "มี สาม ไฟล์ค่ะ",
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(normalize_for_speech(text), expected)

    def test_keeps_plain_thai_text(self):
        text = "สวัสดีค่ะ คุณกลับมาแล้วนะ"
        self.assertEqual(normalize_for_speech(text), text)


if __name__ == "__main__":
    unittest.main()
