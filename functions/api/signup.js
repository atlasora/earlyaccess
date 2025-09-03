export const onRequestPost = async ({ request, env }) => {
    const KIT_API = "https://api.kit.com/v4";
    const headers = {
      "Content-Type": "application/json",
      "X-Kit-Api-Key": env.KIT_API_KEY
    };
  
    try {
      const { email, firstName, country, role } = await request.json();
  
      // --- Basic validation ---
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return json({ ok: false, error: "Valid email is required." }, 400);
      }
      const safeRole = (role || "").trim();
      if (!safeRole) {
        return json({ ok: false, error: "Please choose a role." }, 400);
      }
  
      // --- Custom field mapping (handle both name variants) ---
      const fields = {};
      if (country) {
        fields["Country Of Residence"] = country; // variant A (capital "Of")
        fields["Country of Residence"] = country; // variant B (lowercase "of")
      }
  
      // --- 1) Upsert subscriber ---
      const subResp = await fetch(`${KIT_API}/subscribers`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          first_name: firstName || "",
          email_address: email,
          fields
        })
      });
  
      if (!subResp.ok) {
        const t = await subResp.text();
        throw new Error(`Subscriber upsert failed: ${t}`);
      }
      const subJson = await subResp.json();
      const subscriberId = subJson?.subscriber?.id;
  
      // --- 2) Tag as Host/Guest/Other (IDs from env) ---
      let tagId = null;
      if (/^host$/i.test(safeRole)) tagId = env.KIT_TAG_HOST;
      else if (/^guest$/i.test(safeRole)) tagId = env.KIT_TAG_GUEST;
      else if (/^other$/i.test(safeRole)) tagId = env.KIT_TAG_OTHER || null;
  
      if (tagId && subscriberId) {
        const tagResp = await fetch(`${KIT_API}/tags/${tagId}/subscribers/${subscriberId}`, {
          method: "POST",
          headers,
          body: JSON.stringify({})
        });
        if (!tagResp.ok) {
          const t = await tagResp.text();
          throw new Error(`Tagging failed: ${t}`);
        }
      }
  
      // --- 3) (Optional) Add to a Form by email to trigger automations / double opt-in ---
      if (env.KIT_FORM_ID) {
        const formResp = await fetch(`${KIT_API}/forms/${env.KIT_FORM_ID}/subscribers`, {
          method: "POST",
          headers,
          body: JSON.stringify({ email_address: email })
        });
        if (!formResp.ok) {
          const t = await formResp.text();
          throw new Error(`Form subscribe failed: ${t}`);
        }
      }
  
      return json({ ok: true });
    } catch (err) {
      return json({ ok: false, error: err.message || "Unknown error" }, 400);
    }
  };
  
  function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }
  