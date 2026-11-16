const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const allowed = new Set(["page_view","resource_view","resource_open","resource_download","access_prompt","payment_prompt","registration_started","login_started","quiz_started","quiz_completed","tuition_enquiry"]);
const clean = (value, max=240) => typeof value === "string" ? value.trim().slice(0,max) : null;

export default async request => {
  if (request.method !== "POST") return json(405,{error:"Method not allowed."});
  const url=Netlify.env.get("SUPABASE_URL");
  const serviceKey=Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey=Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  if(!url||!serviceKey||!publishableKey) return json(503,{error:"Activity tracking is not configured."});
  let body;
  try {
    if(Number(request.headers.get("content-length")||0)>12000) return json(413,{error:"Event too large."});
    body=await request.json();
  } catch { return json(400,{error:"Invalid event payload."}); }
  if(!uuid(body.visitor_id)||!allowed.has(body.event_type)) return json(400,{error:"Invalid activity event."});
  let userId=null;
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(token){
    const verified=await fetch(`${url}/auth/v1/user`,{headers:{apikey:publishableKey,Authorization:`Bearer ${token}`}});
    if(verified.ok){const user=await verified.json();userId=user.id||null;}
  }
  const metadata=body.metadata&&typeof body.metadata==="object"&&!Array.isArray(body.metadata)?body.metadata:{};
  const row={
    visitor_id:body.visitor_id,user_id:userId,event_type:body.event_type,
    page_path:clean(body.page_path,500)||"/",resource_id:clean(body.resource_id,160),
    resource_title:clean(body.resource_title,240),resource_category:clean(body.resource_category,120),
    access_type:["free","premium","unknown"].includes(body.access_type)?body.access_type:null,
    grade:clean(body.grade,30),metadata
  };
  const saved=await fetch(`${url}/rest/v1/site_activity_events`,{
    method:"POST",headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json",Prefer:"return=minimal"},
    body:JSON.stringify(row)
  });
  if(!saved.ok){console.error("Activity event insert failed",saved.status,await saved.text());return json(500,{error:"Could not record activity."});}
  return json(202,{ok:true});
};
