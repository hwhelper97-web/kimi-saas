/**
 * Global Currencies Registry for Naxton Platform
 * Covers all ISO-4217 recognized currencies worldwide.
 */
const CURRENCIES = [
  // Major Global Currencies
  { code: "USD", symbol: "$", name: "US Dollar", region: "North America" },
  { code: "EUR", symbol: "€", name: "Euro", region: "Europe" },
  { code: "GBP", symbol: "£", name: "British Pound Sterling", region: "Europe" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar", region: "North America" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", region: "Oceania" },

  // Middle East & North Africa
  { code: "AED", symbol: "AED", name: "UAE Dirham", region: "Middle East" },
  { code: "SAR", symbol: "SAR", name: "Saudi Riyal", region: "Middle East" },
  { code: "QAR", symbol: "QAR", name: "Qatari Riyal", region: "Middle East" },
  { code: "KWD", symbol: "KWD", name: "Kuwaiti Dinar", region: "Middle East" },
  { code: "BHD", symbol: "BHD", name: "Bahraini Dinar", region: "Middle East" },
  { code: "OMR", symbol: "OMR", name: "Omani Rial", region: "Middle East" },
  { code: "JOD", symbol: "JOD", name: "Jordanian Dinar", region: "Middle East" },
  { code: "IQD", symbol: "IQD", name: "Iraqi Dinar", region: "Middle East" },
  { code: "LBP", symbol: "LBP", name: "Lebanese Pound", region: "Middle East" },
  { code: "EGP", symbol: "E£", name: "Egyptian Pound", region: "Middle East" },
  { code: "MAD", symbol: "MAD", name: "Moroccan Dirham", region: "Middle East" },
  { code: "DZD", symbol: "DZD", name: "Algerian Dinar", region: "Middle East" },
  { code: "TND", symbol: "TND", name: "Tunisian Dinar", region: "Middle East" },
  { code: "ILS", symbol: "₪", name: "Israeli New Shekel", region: "Middle East" },

  // South Asia
  { code: "PKR", symbol: "Rs", name: "Pakistani Rupee", region: "South Asia" },
  { code: "INR", symbol: "₹", name: "Indian Rupee", region: "South Asia" },
  { code: "BDT", symbol: "৳", name: "Bangladeshi Taka", region: "South Asia" },
  { code: "LKR", symbol: "Rs", name: "Sri Lankan Rupee", region: "South Asia" },
  { code: "NPR", symbol: "Rs", name: "Nepalese Rupee", region: "South Asia" },
  { code: "AFN", symbol: "؋", name: "Afghan Afghani", region: "South Asia" },
  { code: "MVR", symbol: "Rf", name: "Maldivian Rufiyaa", region: "South Asia" },

  // East & Southeast Asia
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", region: "East Asia" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar", region: "East Asia" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", region: "East Asia" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", region: "East Asia" },
  { code: "KRW", symbol: "₩", name: "South Korean Won", region: "East Asia" },
  { code: "TWD", symbol: "NT$", name: "New Taiwan Dollar", region: "East Asia" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", region: "East Asia" },
  { code: "THB", symbol: "฿", name: "Thai Baht", region: "East Asia" },
  { code: "IDR", symbol: "Rp", name: "Indonesian Rupiah", region: "East Asia" },
  { code: "PHP", symbol: "₱", name: "Philippine Peso", region: "East Asia" },
  { code: "VND", symbol: "₫", name: "Vietnamese Dong", region: "East Asia" },
  { code: "KHM", symbol: "៛", name: "Cambodian Riel", region: "East Asia" },

  // Americas
  { code: "MXN", symbol: "MX$", name: "Mexican Peso", region: "Americas" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real", region: "Americas" },
  { code: "ARS", symbol: "AR$", name: "Argentine Peso", region: "Americas" },
  { code: "CLP", symbol: "CL$", name: "Chilean Peso", region: "Americas" },
  { code: "COP", symbol: "COL$", name: "Colombian Peso", region: "Americas" },
  { code: "PEN", symbol: "S/", name: "Peruvian Sol", region: "Americas" },
  { code: "UYU", symbol: "$U", name: "Uruguayan Peso", region: "Americas" },
  { code: "BOB", symbol: "Bs.", name: "Bolivian Boliviano", region: "Americas" },
  { code: "PYG", symbol: "₲", name: "Paraguayan Guarani", region: "Americas" },
  { code: "CRC", symbol: "₡", name: "Costa Rican Colon", region: "Americas" },
  { code: "DOP", symbol: "RD$", name: "Dominican Peso", region: "Americas" },
  { code: "JMD", symbol: "J$", name: "Jamaican Dollar", region: "Americas" },

  // Europe & Central Asia
  { code: "CHF", symbol: "CHF", name: "Swiss Franc", region: "Europe" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona", region: "Europe" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone", region: "Europe" },
  { code: "DKK", symbol: "kr", name: "Danish Krone", region: "Europe" },
  { code: "PLN", symbol: "zł", name: "Polish Zloty", region: "Europe" },
  { code: "CZK", symbol: "Kč", name: "Czech Koruna", region: "Europe" },
  { code: "HUF", symbol: "Ft", name: "Hungarian Forint", region: "Europe" },
  { code: "TRY", symbol: "₺", name: "Turkish Lira", region: "Europe" },
  { code: "RUB", symbol: "₽", name: "Russian Ruble", region: "Europe" },
  { code: "UAH", symbol: "₴", name: "Ukrainian Hryvnia", region: "Europe" },
  { code: "RON", symbol: "lei", name: "Romanian Leu", region: "Europe" },
  { code: "BGN", symbol: "лв", name: "Bulgarian Lev", region: "Europe" },
  { code: "GEL", symbol: "₾", name: "Georgian Lari", region: "Europe" },
  { code: "KZT", symbol: "₸", name: "Kazakhstani Tenge", region: "Europe" },

  // Africa & Oceania
  { code: "ZAR", symbol: "R", name: "South African Rand", region: "Africa" },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira", region: "Africa" },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling", region: "Africa" },
  { code: "GHS", symbol: "GH₵", name: "Ghanaian Cedi", region: "Africa" },
  { code: "TZS", symbol: "TSh", name: "Tanzanian Shilling", region: "Africa" },
  { code: "UGX", symbol: "USh", name: "Ugandan Shilling", region: "Africa" },
  { code: "ETB", symbol: "Br", name: "Ethiopian Birr", region: "Africa" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar", region: "Oceania" },
  { code: "FJD", symbol: "FJ$", name: "Fijian Dollar", region: "Oceania" }
];

function getCurrencyDetails(code = "USD") {
  const found = CURRENCIES.find(c => c.code === (code || "").toUpperCase());
  return found || { code: "USD", symbol: "$", name: "US Dollar", region: "North America" };
}

function getCurrencySymbol(code = "USD") {
  return getCurrencyDetails(code).symbol;
}

function formatPrice(amount, currencyCode = "USD") {
  const symbol = getCurrencySymbol(currencyCode);
  const num = typeof amount === "number" ? amount : parseFloat(amount) || 0;
  return `${symbol}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderCurrencyOptions(selectedCode = "USD") {
  const regions = {};
  CURRENCIES.forEach(c => {
    if (!regions[c.region]) regions[c.region] = [];
    regions[c.region].push(c);
  });

  let html = "";
  for (const [region, items] of Object.entries(regions)) {
    html += `<optgroup label="${region}">\n`;
    items.forEach(c => {
      const selected = c.code === selectedCode ? "selected" : "";
      html += `  <option value="${c.code}" ${selected}>${c.code} (${c.symbol}) — ${c.name}</option>\n`;
    });
    html += `</optgroup>\n`;
  }
  return html;
}

module.exports = {
  CURRENCIES,
  getCurrencyDetails,
  getCurrencySymbol,
  formatPrice,
  renderCurrencyOptions
};
