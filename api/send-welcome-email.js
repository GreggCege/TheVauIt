const resendApiKey = process.env.RESEND_API_KEY;

module.exports = async (req, res) => {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  const { email, username } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'El correo electrónico es requerido' });
  }

  if (!resendApiKey) {
    console.error('Error: RESEND_API_KEY no está configurada en las variables de entorno.');
    return res.status(500).json({ error: 'API key de Resend no configurada en el servidor' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'The Vault <info@thevaultnow.com>',
        to: [email],
        subject: 'Welcome to The Vault!',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Welcome to The Vault</title>
          </head>
          <body style="margin: 0; padding: 0; background-color: #050505; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #050505; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #0d0d0d; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.05); overflow: hidden; max-width: 600px; width: 100%;">
                    <!-- Header -->
                    <tr>
                      <td align="center" style="padding: 40px 40px 20px 40px;">
                        <h1 style="color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: 6px; margin: 0; text-transform: uppercase; font-family: 'Outfit', 'Inter', sans-serif;">THE VAULT</h1>
                        <div style="width: 50px; height: 1px; background-color: rgba(255, 255, 255, 0.2); margin-top: 20px;"></div>
                      </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                      <td style="padding: 20px 40px 40px 40px; text-align: center;">
                        <p style="color: #ffffff; font-size: 18px; line-height: 1.5; margin: 0 0 20px 0; font-weight: 400;">
                          Hello <span style="font-weight: 700; color: #ffffff;">${username || 'guest'}</span>,
                        </p>
                        <p style="color: #8f8f8f; font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
                          Your registration at <strong>The Vault</strong> has been successful. We are thrilled to welcome you to our exclusive space of premium style and design.
                        </p>
                        <p style="color: #8f8f8f; font-size: 15px; line-height: 1.6; margin: 0 0 35px 0;">
                          From now on, you will be able to manage your orders, save your favorite items, and explore high-quality collections designed to stand out.
                        </p>
                        <!-- Button -->
                        <table border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto 20px auto;">
                          <tr>
                            <td align="center" style="border-radius: 30px;" bgcolor="#ffffff">
                              <a href="${req.headers.origin || 'https://thevault.now'}" target="_blank" style="font-size: 14px; font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; color: #000000; text-decoration: none; border-radius: 30px; padding: 14px 35px; border: 1px solid #ffffff; display: inline-block; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">
                                Explore Collection
                              </a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                      <td align="center" style="background-color: #090909; padding: 30px 40px; border-top: 1px solid rgba(255, 255, 255, 0.03);">
                        <p style="color: #555555; font-size: 11px; line-height: 1.6; margin: 0 0 8px 0; max-width: 300px;">
                          You received this email because you registered at The Vault.
                        </p>
                        <p style="color: #444444; font-size: 11px; line-height: 1.6; margin: 0;">
                          &copy; 2026 The Vault. All rights reserved.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Error de la API de Resend:', data);
      return res.status(response.status).json({ error: data.message || 'Error al enviar correo con Resend' });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error de servidor al enviar correo de bienvenida:', error);
    return res.status(500).json({ error: error.message });
  }
};
