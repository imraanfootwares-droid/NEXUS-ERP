export interface PageGuide {
  title: string;
  whatItIs: string;
  steps: string[];
  tip: string;
}

/**
 * Plain-English, zero-jargon help guides shown when a user clicks the (i) icon
 * at the top of any dashboard page. Written so any shop owner or counter staff
 * can understand and use every screen on their own.
 */
export const PAGE_GUIDES: Array<{ match: (pathname: string) => boolean; guide: PageGuide }> = [
  {
    match: (p) => p === "/dashboard",
    guide: {
      title: "Home",
      whatItIs: "Your shop's daily summary in one place — today's sales, pending dues, and items running low.",
      steps: [
        "Check today's Total Sales, Cash/UPI collected, and Pending Dues at the top.",
        "Tap + New Bill at the top right whenever a customer is ready to pay.",
        "Look at Low Stock items so you know what to reorder before it finishes.",
        "If you have more than one shop, use the top branch dropdown to view one shop or all shops.",
      ],
      tip: "Tap any menu item on the left (or the top-left menu button on mobile) to jump straight to that screen.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/billing/new"),
    guide: {
      title: "Make a New Bill",
      whatItIs: "Create a Normal Bill or GST Bill in seconds, take Cash/UPI/Card payment, and print or download PDF.",
      steps: [
        "At the top right of the bill, choose Normal Bill (simple bill) or GST Bill (with tax details).",
        "Click products on the left (or scan barcode) to add them. Use + and − to change quantity.",
        "Pick a Customer from the customer panel (or leave Walk-In for cash buyers).",
        "Enter how much they paid in Cash, UPI, or Card. Any unpaid amount is saved to their due automatically.",
        "Click Preview to check the bill, then Save & Print or Download PDF.",
      ],
      tip: "Internet went down? Keep making bills normally — everything saves on your device and uploads when internet returns.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/billing"),
    guide: {
      title: "All Bills",
      whatItIs: "Every bill ever made in your shop — reprint, edit mistakes, handle returns, or view change history.",
      steps: [
        "Use the search box or date filters to find any old bill by customer name or bill number.",
        "Click View / Print to see the bill again or download its PDF for WhatsApp.",
        "Made a mistake on an old bill? Click Edit to fix items, price, or payment — stock and dues update automatically.",
        "Click History to see every old change and restore any earlier version in 1 click.",
        "Customer returned an item? Click Return to put stock back and adjust their bill.",
      ],
      tip: "Every edit is safely recorded in History so you always know who changed what and when.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/stock/import"),
    guide: {
      title: "Upload Products from Excel",
      whatItIs: "Add hundreds of products and opening stock at once using an Excel file.",
      steps: [
        "Click Download Template to get a ready-made Excel file.",
        "Fill in your product names, codes, prices, sizes, and stock quantities in Excel.",
        "Upload the filled Excel file here and review the preview rows.",
        "Click Import to add all products to your shop in one go.",
      ],
      tip: "Only adding 1 or 2 new products? Use Stock & Products → + Add Product — it's even faster.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/stock"),
    guide: {
      title: "Stock & Products",
      whatItIs: "See all items in your shop, check remaining stock per size/colour, add products, and print barcodes.",
      steps: [
        "Click + Add Product to add items already sitting in your shop (opening stock).",
        "Click any product card to see stock per size/colour and add or remove stock manually.",
        "Use the Low Stock tab to see items that are nearly finished and need reordering.",
        "Use the Barcodes tab to print sticker labels for your shoe boxes or shelves.",
      ],
      tip: "Bought new stock from a supplier? Enter it in Customers & Suppliers → Suppliers → + New Purchase Bill so both your Stock AND Supplier Balance update together!",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/operations"),
    guide: {
      title: "Send Stock Between Shops",
      whatItIs: "Move your own goods from your Factory or Godown to your Retail Shop (or between branches).",
      steps: [
        "Pick the From Shop (sending goods) and To Shop (receiving goods).",
        "Select the products, sizes, and quantities you are sending.",
        "Optional: add vehicle number, driver, or transport details, then click Send Stock.",
        "When the goods arrive at the other shop, that shop clicks Receive Stock to add them to their shelf.",
      ],
      tip: "A Delivery Challan is automatically created for every transfer so your transport driver can carry proof.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/customers/ledger"),
    guide: {
      title: "Account Statement (Ledger)",
      whatItIs: "Full history of bills, purchases, payments, and the exact remaining balance for this person.",
      steps: [
        "Check the top summary to see Total Billed, Total Paid, and Balance Due.",
        "For a Customer: click Receive Payment when they pay Cash/UPI against their due.",
        "For a Supplier: click + New Purchase Bill when new stock arrives, or Record Payment when you pay them.",
        "Click Download PDF or Excel to share a clean statement on WhatsApp for matching accounts.",
      ],
      tip: "Need to fix an old entry? Use the Edit and History buttons right on any bill row.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/customers"),
    guide: {
      title: "Customers & Suppliers",
      whatItIs: "Keep track of everyone who buys from you (Customers) and everyone you buy from (Suppliers).",
      steps: [
        "Use the Customers tab to see every customer's pending due (udhaar) and add new customers.",
        "Switch to the Suppliers tab to see how much you owe each supplier and add new suppliers.",
        "Click any Customer or Supplier name to open their full Statement (Ledger), record payments, or download PDF.",
      ],
      tip: "You can save over 1,000 customers here — searching by name or phone number is instant.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/enquiries"),
    guide: {
      title: "Customer Enquiries",
      whatItIs: "See all orders and product enquiries sent by buyers from your online website or PDF catalogue.",
      steps: [
        "Open any new enquiry to see the buyer's name, phone number, and the exact items & sizes they want.",
        "Tap WhatsApp or Call to confirm availability and price with the buyer.",
        "Update the status (New → Contacted → Closed) so your whole team knows it is handled.",
      ],
      tip: "Set your WhatsApp number right here so buyer enquiries go straight to your phone as well.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/storefront"),
    guide: {
      title: "Website & PDF Catalogue",
      whatItIs: "Turn on your own online product website and download a printable PDF catalogue to share on WhatsApp.",
      steps: [
        "Turn Online Store ON and enter your shop's WhatsApp number.",
        "Choose which products to show on your website and upload clear product photos.",
        "Copy your Website Link and share it on WhatsApp — buyers can pick sizes and send orders directly to you.",
        "Click Download PDF Catalogue anytime to send a neat photo price list to wholesale buyers.",
      ],
      tip: "Don't want to show prices publicly? Turn Hide Prices ON so buyers click 'Ask for Price' on WhatsApp.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/valuation"),
    guide: {
      title: "Stock Value & Profit",
      whatItIs: "See how much money is currently invested in your shop stock and how much profit your sales earned.",
      steps: [
        "Check Total Stock Cost to see how much money is currently sitting on your shelves.",
        "Compare Retail Value and Wholesale Value to see how much your current stock can sell for.",
        "Switch between Today, This Month, and This Year to track your real sales profit.",
      ],
      tip: "Only the Shop Owner and Branch Manager can see purchase cost and profit — counter staff cannot see this page.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/organisation"),
    guide: {
      title: "Shops & Team",
      whatItIs: "A simple visual map showing all your shops/branches and which staff work in each shop.",
      steps: [
        "See all your shops (Factory, Godown, Retail Branches) at a glance.",
        "Check which managers and cashiers are assigned to each shop.",
        "To add a new shop or staff login, go to Profile & Settings → Shops or Staff.",
      ],
      tip: "Keep staff assigned only to their own shop so they don't accidentally bill from another shop's stock.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/reports"),
    guide: {
      title: "GST & Reports",
      whatItIs: "Download ready-made GST sheets for your accountant (CA), track shop expenses, and close daily cash.",
      steps: [
        "Pick the month or date range you want at the top.",
        "Use GST Reports (GSTR-1 / HSN Summary) to download Excel/CSV files directly for GST filing.",
        "Record daily shop expenses (rent, tea, electricity, transport) in the Expenses tab.",
        "At closing time, check Day-End Close to match physical Cash, UPI, and Card with your bills.",
      ],
      tip: "Your CA can upload the downloaded GSTR-1 file directly without retyping every bill.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/bill-designer"),
    guide: {
      title: "Bill Designs",
      whatItIs: "Pick how your printed bills look — choose from 5 clean Normal Bill styles and 5 GST Bill styles.",
      steps: [
        "Switch between Normal Bill and GST Bill tabs at the top.",
        "Pick one of the 5 layouts and choose your printer paper size (A4, A5, or Thermal roll).",
        "Turn switches ON/OFF to show or hide Logo, Bank Details, UPI, or Terms, and watch the live preview.",
        "Click Save Design — every new bill and PDF will automatically use your chosen style.",
      ],
      tip: "Your shop name, address, GST number, and bank account come automatically from Profile & Settings.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/trash"),
    guide: {
      title: "Trash (15-Day Recycle Bin)",
      whatItIs: "Safely recover bills, supplier purchase bills, or expenses you deleted by mistake within 15 days.",
      steps: [
        "Whenever you delete a bill, purchase bill, or expense, it moves here automatically for 15 days.",
        "Use the filter tabs (All, Sales Bills, Purchase Bills, Expenses) to find what you deleted.",
        "Click Restore to bring the bill back immediately — your stock and customer/supplier balances update automatically.",
        "After 15 days, old items in Trash clear automatically so your account stays fast and clean.",
      ],
      tip: "Need to remove something right away? Click Delete Forever on that item or Empty Trash at the top right.",
    },
  },
  {
    match: (p) => p.startsWith("/dashboard/settings"),
    guide: {
      title: "Profile & Settings",
      whatItIs: "One-time setup for your shop details, GST rules, product options (sizes/colours), shops, staff, and backups.",
      steps: [
        "My Profile, Bank & GST: Enter your shop address, GST number, bank account, and GST rules once.",
        "Shop Look: Upload your shop logo and choose your brand colour.",
        "Product Options: Add or edit your Sizes, Colours, and Extra Product Details and test them live.",
        "Shops & Staff: Add branches, create cashier logins, and control what staff are allowed to do.",
        "Backups: Download a full copy of all your shop data to your computer anytime.",
      ],
      tip: "Anything you change in Product Options automatically updates Add Product, Website, and Bills everywhere.",
    },
  },
];

export function getPageGuide(pathname: string): PageGuide {
  const found = PAGE_GUIDES.find((entry) => entry.match(pathname));
  return (
    found?.guide ?? {
      title: "How This Page Works",
      whatItIs: "Manage your shop's billing, stock, customers, and reports from one simple place.",
      steps: [
        "Use the left menu to switch between Billing, Stock, Customers, and Settings.",
        "Click the + New Bill button at the top right anytime to make a quick bill.",
      ],
      tip: "Look for the (i) icon at the top of any screen whenever you need a quick step-by-step guide.",
    }
  );
}
