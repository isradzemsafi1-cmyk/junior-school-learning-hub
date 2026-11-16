const reply=(status,body,headers={})=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...headers}});
const SUPABASE_URL=()=>Netlify.env.get("SUPABASE_URL");
const SERVICE_KEY=()=>Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
const PUBLISHABLE_KEY="sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
const BUCKET="learner-revision-premium";
async function getUser(request){
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\\s+/i,"");
 if(!token)return null;
 const r=await fetch(`${SUPABASE_URL()}/auth/v1/user`,{headers:{apikey:PUBLISHABLE_KEY,Authorization:`Bearer ${token}`}});
 if(!r.ok)return null;const u=await r.json();return u?.id?{id:u.id}:null;
}
export default async(request)=>{
 if(request.method!=="GET")return reply(405,{success:false,message:"GET only."});
 const url=SUPABASE_URL(),key=SERVICE_KEY();
 if(!url||!key)return reply(500,{success:false,message:"Revision library is not configured."});
 const headers={apikey:key,Authorization:`Bearer ${key}`};
 const resourceId=new URL(request.url).searchParams.get("id");
 try{
  if(!resourceId){
   const r=await fetch(`${url}/rest/v1/learner_revision_resources?published=eq.true&select=id,title,subject,grade,resource_type,description,price_kes&order=resource_type.asc,subject.asc`,{headers});
   if(!r.ok)throw new Error("Could not load revision catalogue.");
   return reply(200,{success:true,resources:await r.json()});
  }
  if(!/^kjsea2027_[a-z0-9_]{3,80}$/.test(resourceId))return reply(400,{success:false,message:"Invalid revision resource."});
  const user=await getUser(request);if(!user)return reply(401,{success:false,message:"Sign in to open a purchased PDF."});
  const q=new URLSearchParams({user_id:`eq.${user.id}`,product_id:`eq.${resourceId}`,active:"eq.true",expires_at:`gt.${new Date().toISOString()}`,select:"id",limit:"1"});
  const access=await fetch(`${url}/rest/v1/entitlements?${q}`,{headers});
  if(!access.ok)throw new Error("Could not verify purchase access.");
  if(!(await access.json()).length)return reply(403,{success:false,message:"This PDF is locked. Pay KES 10 to unlock it."});
  const meta=await fetch(`${url}/rest/v1/learner_revision_resources?id=eq.${encodeURIComponent(resourceId)}&published=eq.true&select=storage_path,title&limit=1`,{headers});
  if(!meta.ok)throw new Error("Could not retrieve resource details.");
  const rows=await meta.json();if(!rows.length)return reply(404,{success:false,message:"Revision resource is not published yet."});
  const file=await fetch(`${url}/storage/v1/object/${BUCKET}/${rows[0].storage_path}`,{headers});
  if(!file.ok)return reply(404,{success:false,message:"PDF upload is still pending. Please try again later."});
  const safe=String(rows[0].title||"KJSEA-revision").replace(/[^a-z0-9_-]+/gi,"-").slice(0,90);
  return new Response(file.body,{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${safe}.pdf"`,"Cache-Control":"private, no-store"}});
 }catch(e){console.error("KJSEA revision resource error:",e.message);return reply(500,{success:false,message:"Could not load the revision resource."});}
};
