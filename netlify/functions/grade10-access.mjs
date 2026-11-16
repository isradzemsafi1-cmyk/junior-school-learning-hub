const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const SUPABASE_URL=()=>Netlify.env.get("SUPABASE_URL");
const SERVICE_KEY=()=>Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PUBLISHABLE_KEY="sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";

export default async(request)=>{
  if(request.method!=="GET")return json(405,{success:false,message:"GET only."});
  const url=SUPABASE_URL(),serviceKey=SERVICE_KEY();
  if(!url||!serviceKey)return json(500,{success:false,message:"Career access verification is not configured."});
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\\s+/i,"");
  if(!token)return json(401,{success:false,message:"Sign in to check your Grade 10 selection access."});
  try{
    const auth=await fetch(`${url}/auth/v1/user`,{headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${token}`}});
    if(!auth.ok)return json(401,{success:false,message:"Your learner session has expired. Sign in again."});
    const user=await auth.json();
    if(!user?.id)return json(401,{success:false,message:"Learner account could not be verified."});
    const now=new Date().toISOString();
    const q=new URLSearchParams({user_id:`eq.${user.id}`,product_id:"eq.grade10_selection_form",active:"eq.true",expires_at:`gt.${now}`,select:"id,expires_at",limit:"1"});
    const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`};
    const response=await fetch(`${url}/rest/v1/entitlements?${q}`,{headers});
    if(!response.ok)throw new Error("Could not verify Grade 10 entitlement.");
    const rows=await response.json();
    if(!rows.length)return json(200,{success:true,paid:false});
    return json(200,{success:true,paid:true,expiresAt:rows[0].expires_at});
  }catch(error){
    console.error("Grade 10 access check failed:",error.message);
    return json(500,{success:false,message:"Unable to verify your payment access right now."});
  }
};