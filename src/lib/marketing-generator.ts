import { formatMoney } from "@/components/shared/currency";
import type { Vehicle } from "@/types/vehicle";
import type { MarketingContentType } from "@/types/marketing";

export type TranslationTargetLanguage = "en" | "ar" | "ur" | "hi" | "fr" | "es" | "ru";

export const translationTargetLanguages: { value: TranslationTargetLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
  { value: "ur", label: "Urdu" },
  { value: "hi", label: "Hindi" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "ru", label: "Russian" },
];

function vehicleLabel(v: Vehicle): string {
  return `${v.year} ${v.make} ${v.model} ${v.trim}`;
}

export function generateMarketingContent(vehicle: Vehicle, type: MarketingContentType): string {
  const label = vehicleLabel(vehicle);
  const price = formatMoney(vehicle.price);
  const mileage = vehicle.spec.mileageKm.toLocaleString();
  const accidentFree = vehicle.spec.accidentHistory === "none";
  const transmission = vehicle.spec.transmission === "automatic" ? "Automatic" : "Manual";

  switch (type) {
    case "vehicle_ad":
      return `🚗 ${label}\n\n${vehicle.condition === "new" ? "Brand new" : `${mileage} km`} · ${vehicle.spec.exteriorColor} exterior · ${transmission} · ${vehicle.spec.fuelType}\n\nPriced at ${price}. Immaculately maintained with ${vehicle.spec.serviceHistory === "full" ? "full" : "verified"} service history${accidentFree ? " and zero accidents" : ""}.\n\nAvailable now at ${vehicle.location}. Book your test drive today!`;

    case "instagram_caption":
      return `✨ ${label} just landed. ${vehicle.spec.exteriorColor} never looked this good. 📍 ${vehicle.location}\n\nDM us or tap the link in bio to book a test drive.\n\n#${vehicle.make.replace(/\s+/g, "")} #${vehicle.model.replace(/\s+/g, "")} #DubaiCars #LuxuryCars #CarsOfInstagram`;

    case "facebook_post":
      return `🔥 Now available: ${label}\n\n✅ ${transmission} transmission\n✅ ${mileage} km on the odometer\n✅ ${vehicle.spec.serviceHistory === "full" ? "Full service history" : "Verified service records"}\n✅ Priced at ${price}\n\nVisit us at ${vehicle.location} or message us to schedule a viewing.`;

    case "tiktok_script":
      return `[Hook — 0-3s]\n"You need to see this ${vehicle.make} ${vehicle.model} before it's gone."\n\n[Walkaround — 3-12s]\nShow exterior angles, focus on the ${vehicle.spec.exteriorColor} paint and wheels.\n\n[Interior — 12-20s]\nPan across the ${vehicle.spec.interiorColor} interior, highlight the seats and dash.\n\n[CTA — 20-25s]\n"${label}, only ${price}. Link in bio to book your test drive today."`;

    case "whatsapp_message":
      return `Hi! 👋 Just wanted to let you know we have a ${label} available for ${price}. It has ${mileage} km on the clock and is in excellent condition. Would you like to schedule a viewing this week?`;

    case "email":
      return `Subject: Your next car is here — ${label}\n\nHi there,\n\nWe thought you'd want to know about a ${label} that just arrived in our showroom. It's finished in ${vehicle.spec.exteriorColor}, has ${mileage} km on the odometer, and is priced at ${price}.\n\nWould you like to book a test drive this week? Simply reply to this email or call us at your convenience.\n\nBest regards,\nYour Dealership Team`;

    case "listing_description":
      return `${label}\n\nCondition: ${vehicle.condition.replace(/_/g, " ")}\nMileage: ${mileage} km\nTransmission: ${vehicle.spec.transmission}\nFuel type: ${vehicle.spec.fuelType}\nExterior: ${vehicle.spec.exteriorColor} | Interior: ${vehicle.spec.interiorColor}\nEngine: ${vehicle.spec.engine} (${vehicle.spec.horsepower} hp)\nImport spec: ${vehicle.spec.importSpec}\nService history: ${vehicle.spec.serviceHistory}\nAccident history: ${vehicle.spec.accidentHistory}\n\nPrice: ${price}\nLocation: ${vehicle.location}\n\nContact us today to arrange a viewing or test drive.`;

    case "seo_description":
      return `Buy a ${label} in Dubai — ${mileage} km, ${transmission.toLowerCase()} transmission, priced at ${price}. Inspected, ${accidentFree ? "accident-free" : "fully disclosed history"}, and ready for immediate delivery. Browse our full ${vehicle.make} inventory and book a test drive online today.`;
  }
}

export function translateAdvertisement(vehicle: Vehicle, target: TranslationTargetLanguage): string {
  const label = vehicleLabel(vehicle);
  const price = formatMoney(vehicle.price);
  const mileage = vehicle.spec.mileageKm.toLocaleString();
  const accidentFree = vehicle.spec.accidentHistory === "none";
  const auto = vehicle.spec.transmission === "automatic";
  const fullService = vehicle.spec.serviceHistory === "full";

  switch (target) {
    case "ar":
      return `🚗 ${label}\n\n${vehicle.condition === "new" ? "جديدة تمامًا" : `${mileage} كم`} · لون خارجي ${vehicle.spec.exteriorColor} · ${auto ? "ناقل أوتوماتيكي" : "ناقل يدوي"}\n\nبسعر ${price}. بحالة ممتازة وسجل صيانة ${fullService ? "كامل" : "موثّق"}${accidentFree ? "، وبدون أي حوادث" : ""}.\n\nمتوفرة الآن في ${vehicle.location}. احجز تجربة القيادة اليوم!`;
    case "ur":
      return `🚗 ${label}\n\n${vehicle.condition === "new" ? "بالکل نئی" : `${mileage} کلومیٹر`} · بیرونی رنگ ${vehicle.spec.exteriorColor} · ${auto ? "آٹومیٹک" : "مینوئل"} ٹرانسمیشن\n\nقیمت ${price}۔ بہترین حالت میں، ${fullService ? "مکمل" : "تصدیق شدہ"} سروس ہسٹری کے ساتھ${accidentFree ? "، کسی حادثے کے بغیر" : ""}۔\n\nابھی ${vehicle.location} پر دستیاب ہے۔ آج ہی ٹیسٹ ڈرائیو بک کریں!`;
    case "hi":
      return `🚗 ${label}\n\n${vehicle.condition === "new" ? "बिल्कुल नई" : `${mileage} किमी`} · बाहरी रंग ${vehicle.spec.exteriorColor} · ${auto ? "ऑटोमैटिक" : "मैनुअल"} ट्रांसमिशन\n\nकीमत ${price}। बेहतरीन स्थिति में, ${fullService ? "पूरी" : "सत्यापित"} सर्विस हिस्ट्री के साथ${accidentFree ? ", कोई दुर्घटना नहीं" : ""}।\n\nअभी ${vehicle.location} पर उपलब्ध है। आज ही टेस्ट ड्राइव बुक करें!`;
    case "fr":
      return `🚗 ${label}\n\n${vehicle.condition === "new" ? "Neuve" : `${mileage} km`} · Extérieur ${vehicle.spec.exteriorColor} · Transmission ${auto ? "automatique" : "manuelle"}\n\nAu prix de ${price}. Parfaitement entretenue, historique d'entretien ${fullService ? "complet" : "vérifié"}${accidentFree ? ", sans accident" : ""}.\n\nDisponible dès maintenant à ${vehicle.location}. Réservez votre essai dès aujourd'hui !`;
    case "es":
      return `🚗 ${label}\n\n${vehicle.condition === "new" ? "Totalmente nuevo" : `${mileage} km`} · Exterior ${vehicle.spec.exteriorColor} · Transmisión ${auto ? "automática" : "manual"}\n\nPrecio: ${price}. Excelente estado, historial de mantenimiento ${fullService ? "completo" : "verificado"}${accidentFree ? ", sin accidentes" : ""}.\n\nDisponible ahora en ${vehicle.location}. ¡Reserva tu prueba de manejo hoy!`;
    case "ru":
      return `🚗 ${label}\n\n${vehicle.condition === "new" ? "Новый автомобиль" : `Пробег ${mileage} км`} · Цвет кузова: ${vehicle.spec.exteriorColor} · ${auto ? "Автоматическая" : "Механическая"} коробка передач\n\nЦена: ${price}. Отличное состояние, ${fullService ? "полная" : "подтверждённая"} сервисная история${accidentFree ? ", без ДТП" : ""}.\n\nДоступен сейчас в ${vehicle.location}. Забронируйте тест-драйв уже сегодня!`;
    case "en":
    default:
      return generateMarketingContent(vehicle, "vehicle_ad");
  }
}
