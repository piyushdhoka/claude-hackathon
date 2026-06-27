"""Bundled per-language notify templates (offline fallback for the Claude path).

Each carries the help-center name and a claim code only — never the found
person's identifying details. ``render`` falls back to English for any language
without a bundled template.
"""
from __future__ import annotations

ENGLISH = ("Your family member has been found safe at {center}. "
           "Show claim code {code} to the help desk. Reply 1 for directions.")

TEMPLATES: dict[str, str] = {
    "English": ENGLISH,
    "Hindi": ("नमस्ते। आपके परिजन {center} केंद्र पर सुरक्षित हैं। "
              "हेल्प डेस्क पर कोड {code} दिखाएँ। दिशा के लिए 1 दबाएँ।"),
    "Marathi": ("नमस्कार. तुमचे नातेवाईक {center} केंद्रावर सुरक्षित आहेत. "
                "मदत कक्षात कोड {code} दाखवा. दिशेसाठी 1 दाबा."),
    "Bengali": ("নমস্কার। আপনার পরিবারের সদস্য {center} কেন্দ্রে নিরাপদ আছেন। "
                "হেল্প ডেস্কে কোড {code} দেখান। দিকনির্দেশের জন্য 1 চাপুন।"),
    "Tamil": ("வணக்கம். உங்கள் குடும்ப உறுப்பினர் {center} மையத்தில் பாதுகாப்பாக உள்ளார். "
              "உதவி மையத்தில் குறியீடு {code} ஐக் காட்டவும். வழிக்கு 1 ஐ அழுத்தவும்."),
    "Telugu": ("నమస్కారం. మీ కుటుంబ సభ్యుడు {center} కేంద్రంలో సురక్షితంగా ఉన్నారు. "
               "హెల్ప్ డెస్క్‌లో కోడ్ {code} చూపించండి. దిశ కోసం 1 నొక్కండి."),
    "Gujarati": ("નમસ્તે. તમારા પરિવારના સભ્ય {center} કેન્દ્ર પર સુરક્ષિત છે. "
                 "હેલ્પ ડેસ્ક પર કોડ {code} બતાવો. દિશા માટે 1 દબાવો."),
}


def render(language: str | None, center: str, code: str) -> str:
    template = TEMPLATES.get((language or "").strip(), ENGLISH)
    return template.format(center=center, code=code)
