const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    const { items, shippingState } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'No items in cart' });
    }

    const TAX_RATES = {
      AL: { rate: 0.0400, taxShipping: true },
      AK: { rate: 0.0000, taxShipping: false },
      AZ: { rate: 0.0560, taxShipping: false },
      AR: { rate: 0.0650, taxShipping: true },
      CA: { rate: 0.0725, taxShipping: false },
      CO: { rate: 0.0290, taxShipping: false },
      CT: { rate: 0.0635, taxShipping: true },
      DE: { rate: 0.0000, taxShipping: false },
      DC: { rate: 0.0600, taxShipping: true },
      FL: { rate: 0.0600, taxShipping: true },
      GA: { rate: 0.0400, taxShipping: true },
      HI: { rate: 0.0400, taxShipping: true },
      ID: { rate: 0.0600, taxShipping: true },
      IL: { rate: 0.0625, taxShipping: true }, // Warehouse state Rockford, Illinois
      IN: { rate: 0.0700, taxShipping: true },
      IA: { rate: 0.0600, taxShipping: false },
      KS: { rate: 0.0650, taxShipping: true },
      KY: { rate: 0.0600, taxShipping: true },
      LA: { rate: 0.0500, taxShipping: false },
      ME: { rate: 0.0550, taxShipping: false },
      MD: { rate: 0.0600, taxShipping: false },
      MA: { rate: 0.0625, taxShipping: false },
      MI: { rate: 0.0600, taxShipping: true },
      MN: { rate: 0.0688, taxShipping: true },
      MS: { rate: 0.0700, taxShipping: true },
      MO: { rate: 0.0423, taxShipping: false },
      MT: { rate: 0.0000, taxShipping: false },
      NE: { rate: 0.0550, taxShipping: true },
      NV: { rate: 0.0685, taxShipping: false },
      NH: { rate: 0.0000, taxShipping: false },
      NJ: { rate: 0.06625, taxShipping: true },
      NM: { rate: 0.04875, taxShipping: true },
      NY: { rate: 0.0400, taxShipping: true },
      NC: { rate: 0.0475, taxShipping: true },
      ND: { rate: 0.0500, taxShipping: true },
      OH: { rate: 0.0575, taxShipping: true },
      OK: { rate: 0.0450, taxShipping: false },
      OR: { rate: 0.0000, taxShipping: false },
      PA: { rate: 0.0600, taxShipping: true },
      RI: { rate: 0.0700, taxShipping: true },
      SC: { rate: 0.0600, taxShipping: true },
      SD: { rate: 0.0420, taxShipping: true },
      TN: { rate: 0.0700, taxShipping: true },
      TX: { rate: 0.0625, taxShipping: true },
      UT: { rate: 0.0610, taxShipping: true },
      VT: { rate: 0.0600, taxShipping: true },
      VA: { rate: 0.0530, taxShipping: false },
      WA: { rate: 0.0650, taxShipping: true },
      WV: { rate: 0.0600, taxShipping: true },
      WI: { rate: 0.0500, taxShipping: true },
      WY: { rate: 0.0400, taxShipping: true }
    };

    // Map cart items to Stripe line_items format
    const lineItems = items.map((item) => {
      const unitAmount = Math.round(parseFloat(item.price) * 100);
      return {
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.title,
            images: item.imageUrl ? [item.imageUrl] : [],
            description: item.category || 'Product',
          },
          unit_amount: unitAmount,
        },
        quantity: item.quantity || 1,
      };
    });

    // Calculate shipping cost on the server side
    const subtotal = items.reduce((sum, item) => sum + parseFloat(item.price || 0) * (item.quantity || 1), 0);
    let shippingCost = 0;
    if (subtotal < 100) {
      let maxCost = 0;
      items.forEach(item => {
        const size = (item.shippingSize || 'small').toLowerCase();
        let cost = 5;
        if (size === 'medium') cost = 10;
        else if (size === 'large') cost = 20;
        else if (size === 'free') cost = 0;
        if (cost > maxCost) {
          maxCost = cost;
        }
      });
      shippingCost = maxCost;
    }
    const shippingAmountInCents = Math.round(shippingCost * 100);

    // Calculate Sales Tax
    let taxAmount = 0;
    let taxRateInfo = null;
    if (shippingState) {
      const cleanState = shippingState.trim().toUpperCase();
      taxRateInfo = TAX_RATES[cleanState];
      if (taxRateInfo) {
        const taxableAmount = subtotal + (taxRateInfo.taxShipping ? shippingCost : 0);
        taxAmount = taxableAmount * taxRateInfo.rate;
      }
    }

    if (taxAmount > 0) {
      const taxAmountInCents = Math.round(taxAmount * 100);
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Sales Tax (${(taxRateInfo.rate * 100).toFixed(2)}% ${shippingState.trim().toUpperCase()})`,
            description: `State Sales Tax for ${shippingState.trim().toUpperCase()}`,
          },
          unit_amount: taxAmountInCents,
        },
        quantity: 1,
      });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'MX', 'GB'],
      },
      shipping_options: [
        {
          shipping_rate_data: {
            type: 'fixed_amount',
            fixed_amount: {
              amount: shippingAmountInCents,
              currency: 'usd',
            },
            display_name: shippingCost === 0 ? 'Free Shipping' : 'Standard Shipping',
            delivery_estimate: {
              minimum: { unit: 'business_day', value: 3 },
              maximum: { unit: 'business_day', value: 7 },
            }
          }
        }
      ],
      success_url: `${req.headers.origin}/Cart.html?success=true`,
      cancel_url: `${req.headers.origin}/Cart.html?canceled=true`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};
