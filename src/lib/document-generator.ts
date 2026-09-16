import { formatMoney } from "@/components/shared/currency";
import type { Customer } from "@/types/customer";
import type { DocumentType } from "@/types/document";
import type { Vehicle } from "@/types/vehicle";

const DEALER_EN = "Downtown Dubai Showroom, Dubai, UAE";
const DEALER_AR = "معرض داون تاون دبي، دبي، الإمارات العربية المتحدة";

function vehicleLine(vehicle?: Vehicle): string {
  return vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} (VIN: ${vehicle.spec.vin})`
    : "[Vehicle details pending]";
}

function customerLine(customer?: Customer): string {
  return customer ? `${customer.name} (${customer.phone}, ${customer.email})` : "[Customer details pending]";
}

function today(): string {
  return new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export function generateDocumentContent(type: DocumentType, opts: { vehicle?: Vehicle; customer?: Customer }): string {
  const { vehicle, customer } = opts;
  const price = vehicle ? formatMoney(vehicle.price) : "[Amount pending]";
  const vat = vehicle ? formatMoney({ amount: Math.round(vehicle.price.amount * 0.05), currency: vehicle.price.currency }) : "[VAT pending]";

  switch (type) {
    case "purchase_agreement":
      return `VEHICLE PURCHASE AGREEMENT\n\nDate: ${today()}\nDealer: ${DEALER_EN}\nSeller (Customer): ${customerLine(customer)}\n\nVehicle: ${vehicleLine(vehicle)}\nAgreed purchase price: ${price}\n\nThe dealer agrees to purchase the above vehicle from the seller subject to inspection and verification of ownership documents. Payment will be issued upon successful transfer of title and completion of due diligence.\n\nSignatures:\nDealer representative: ______________________\nSeller: ______________________`;

    case "sales_agreement":
      return `VEHICLE SALES AGREEMENT\n\nDate: ${today()}\nDealer: ${DEALER_EN}\nBuyer: ${customerLine(customer)}\n\nVehicle: ${vehicleLine(vehicle)}\nSale price: ${price}\n\nThe dealer agrees to sell, and the buyer agrees to purchase, the above vehicle in its current condition, inspected and disclosed as per the attached inspection report. Ownership transfers upon full payment and registration.\n\nSignatures:\nDealer representative: ______________________\nBuyer: ______________________`;

    case "quotation":
      return `QUOTATION\n\nDate: ${today()}\nPrepared for: ${customerLine(customer)}\nDealer: ${DEALER_EN}\n\nVehicle: ${vehicleLine(vehicle)}\nQuoted price: ${price}\nVAT (5%): ${vat}\n\nThis quotation is valid for 7 days from the date of issue and is subject to vehicle availability.`;

    case "invoice":
      return `TAX INVOICE\n\nDate: ${today()}\nBilled to: ${customerLine(customer)}\nDealer: ${DEALER_EN}\n\nDescription: ${vehicleLine(vehicle)}\nAmount due: ${price}\n\nPayment terms: Due upon receipt. Thank you for your business.`;

    case "receipt":
      return `PAYMENT RECEIPT\n\nDate: ${today()}\nReceived from: ${customerLine(customer)}\nDealer: ${DEALER_EN}\n\nFor: ${vehicleLine(vehicle)}\nAmount received: ${price}\nPayment method: [To be specified]\n\nThis receipt confirms payment received in full.`;

    case "inspection_report":
      return `VEHICLE INSPECTION REPORT\n\nDate: ${today()}\nInspector: ${DEALER_EN}\nVehicle: ${vehicleLine(vehicle)}\n\nExterior: ${vehicle ? "Good — minor wear consistent with age" : "[Pending inspection]"}\nInterior: ${vehicle ? "Good condition" : "[Pending inspection]"}\nEngine & mechanical: ${vehicle ? "No faults detected" : "[Pending inspection]"}\nAccident history: ${vehicle?.spec.accidentHistory ?? "[Pending]"}\nService history: ${vehicle?.spec.serviceHistory ?? "[Pending]"}\nMileage: ${vehicle ? `${vehicle.spec.mileageKm.toLocaleString()} km` : "[Pending]"}\n\nOverall condition: ${vehicle ? "Approved for sale" : "[Pending inspection]"}`;

    case "delivery_form":
      return `VEHICLE DELIVERY FORM\n\nDate: ${today()}\nDelivered to: ${customerLine(customer)}\nDealer: ${DEALER_EN}\n\nVehicle: ${vehicleLine(vehicle)}\n\nItems delivered:\n☐ Vehicle keys (2 sets)\n☐ Registration card\n☐ Service booklet\n☐ Owner's manual\n☐ Warranty documents\n\nCustomer acknowledges receipt of the vehicle in the condition described above.\n\nSignatures:\nDealer representative: ______________________\nCustomer: ______________________`;

    case "customer_agreement":
      return `CUSTOMER AGREEMENT\n\nDate: ${today()}\nCustomer: ${customerLine(customer)}\nDealer: ${DEALER_EN}\n\nThis agreement outlines the terms of service between the customer and ${DEALER_EN} regarding the purchase, financing, or servicing of the vehicle: ${vehicleLine(vehicle)}.\n\nBy signing below, the customer acknowledges having read and agreed to the dealer's terms and conditions.\n\nSignatures:\nDealer representative: ______________________\nCustomer: ______________________`;
  }
}

function vehicleLineAr(vehicle?: Vehicle): string {
  return vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} (رقم الهيكل: ${vehicle.spec.vin})`
    : "[تفاصيل المركبة قيد الانتظار]";
}

function customerLineAr(customer?: Customer): string {
  return customer ? `${customer.name} (${customer.phone}, ${customer.email})` : "[بيانات العميل قيد الانتظار]";
}

function todayAr(): string {
  return new Date().toLocaleDateString("ar-AE", { day: "2-digit", month: "long", year: "numeric" });
}

export function generateDocumentContentArabic(type: DocumentType, opts: { vehicle?: Vehicle; customer?: Customer }): string {
  const { vehicle, customer } = opts;
  const price = vehicle ? formatMoney(vehicle.price) : "[المبلغ قيد التحديد]";
  const vat = vehicle ? formatMoney({ amount: Math.round(vehicle.price.amount * 0.05), currency: vehicle.price.currency }) : "[قيد التحديد]";
  const v = vehicleLineAr(vehicle);
  const c = customerLineAr(customer);
  const date = todayAr();

  switch (type) {
    case "purchase_agreement":
      return `اتفاقية شراء مركبة\n\nالتاريخ: ${date}\nالمعرض: ${DEALER_AR}\nالبائع (العميل): ${c}\n\nالمركبة: ${v}\nسعر الشراء المتفق عليه: ${price}\n\nيوافق المعرض على شراء المركبة المذكورة أعلاه من البائع، وذلك رهناً بالفحص والتحقق من مستندات الملكية. سيتم سداد المبلغ عند إتمام نقل الملكية والتحقق اللازم.\n\nالتوقيعات:\nممثل المعرض: ______________________\nالبائع: ______________________`;

    case "sales_agreement":
      return `اتفاقية بيع مركبة\n\nالتاريخ: ${date}\nالمعرض: ${DEALER_AR}\nالمشتري: ${c}\n\nالمركبة: ${v}\nسعر البيع: ${price}\n\nيوافق المعرض على بيع المركبة المذكورة أعلاه للمشتري بحالتها الراهنة، وفقاً لتقرير الفحص المرفق. تنتقل الملكية عند سداد كامل المبلغ وإتمام إجراءات التسجيل.\n\nالتوقيعات:\nممثل المعرض: ______________________\nالمشتري: ______________________`;

    case "quotation":
      return `عرض سعر\n\nالتاريخ: ${date}\nمُعد لـ: ${c}\nالمعرض: ${DEALER_AR}\n\nالمركبة: ${v}\nالسعر المعروض: ${price}\nضريبة القيمة المضافة (5%): ${vat}\n\nهذا العرض صالح لمدة 7 أيام من تاريخ الإصدار وخاضع لتوفر المركبة.`;

    case "invoice":
      return `فاتورة ضريبية\n\nالتاريخ: ${date}\nموجهة إلى: ${c}\nالمعرض: ${DEALER_AR}\n\nالوصف: ${v}\nالمبلغ المستحق: ${price}\n\nشروط الدفع: مستحق عند الاستلام. شكراً لتعاملكم معنا.`;

    case "receipt":
      return `إيصال دفع\n\nالتاريخ: ${date}\nالمستلم من: ${c}\nالمعرض: ${DEALER_AR}\n\nمقابل: ${v}\nالمبلغ المستلم: ${price}\nطريقة الدفع: [قيد التحديد]\n\nيؤكد هذا الإيصال استلام المبلغ بالكامل.`;

    case "inspection_report":
      return `تقرير فحص المركبة\n\nالتاريخ: ${date}\nالفاحص: ${DEALER_AR}\nالمركبة: ${v}\n\nالهيكل الخارجي: ${vehicle ? "جيد — تآكل بسيط يتناسب مع عمر المركبة" : "[قيد الفحص]"}\nالمقصورة الداخلية: ${vehicle ? "حالة جيدة" : "[قيد الفحص]"}\nالمحرك والميكانيكا: ${vehicle ? "لا توجد أعطال" : "[قيد الفحص]"}\nسجل الحوادث: ${vehicle?.spec.accidentHistory ?? "[قيد التحديد]"}\nسجل الصيانة: ${vehicle?.spec.serviceHistory ?? "[قيد التحديد]"}\nالمسافة المقطوعة: ${vehicle ? `${vehicle.spec.mileageKm.toLocaleString()} كم` : "[قيد التحديد]"}\n\nالحالة العامة: ${vehicle ? "معتمدة للبيع" : "[قيد الفحص]"}`;

    case "delivery_form":
      return `نموذج تسليم المركبة\n\nالتاريخ: ${date}\nتم التسليم إلى: ${c}\nالمعرض: ${DEALER_AR}\n\nالمركبة: ${v}\n\nالعناصر المسلّمة:\n☐ مفاتيح المركبة (طقمان)\n☐ بطاقة التسجيل\n☐ دفتر الصيانة\n☐ دليل المالك\n☐ مستندات الضمان\n\nيقر العميل باستلام المركبة بالحالة الموضحة أعلاه.\n\nالتوقيعات:\nممثل المعرض: ______________________\nالعميل: ______________________`;

    case "customer_agreement":
      return `اتفاقية العميل\n\nالتاريخ: ${date}\nالعميل: ${c}\nالمعرض: ${DEALER_AR}\n\nتحدد هذه الاتفاقية شروط التعامل بين العميل و${DEALER_AR} فيما يتعلق بشراء أو تمويل أو صيانة المركبة: ${v}.\n\nبالتوقيع أدناه، يقر العميل بأنه قرأ ووافق على الشروط والأحكام الخاصة بالمعرض.\n\nالتوقيعات:\nممثل المعرض: ______________________\nالعميل: ______________________`;
  }
}
