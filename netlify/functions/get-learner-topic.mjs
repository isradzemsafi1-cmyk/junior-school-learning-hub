import { grade8Content, grade8Metadata } from "../content/grade8-mathematics-content.mjs";
import grade9Content from "../content/grade9-library-content.mjs";
const slug=(v,i)=>`${String(v||`topic-${i+1}`).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)}-${i+1}`;
const grade9Metadata=grade9Content.map((item,index)=>{const m=/<h2>\s*Topic:\s*([^<]+)<\/h2>/i.exec(item.notes||"");const title=m?.[1]?.trim()||item.subject;return{resource_id:`learner_g9_${slug(title,index)}`,title,description:`${item.subject} notes and practice quiz`,grade:9,subject:item.subject};});
const respond=(status,data)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const metaFor=(grade,content)=>content.map((item,index)=>({resource_id:`learner_g${grade}_${slug(item.sub||item.strand||item.topic||item.subject,index)}`,title:item.sub||item.topic||item.strand||item.subject||`Grade ${grade} topic ${index+1}`,description:[item.strand,item.coverage].filter(Boolean).join(" · ")||`Grade ${grade} topic notes and practice quiz`,grade,subject:item.subject||(grade===8?"Mathematics":"Learning area"),term:item.term||null}));
const getGrade7=async(url,key)=>{const r=await fetch(`${url}/storage/v1/object/premium-learning-content/grade7-library-content.json`,{headers:{apikey:key,Authorization:`Bearer ${key}`}});if(!r.ok)throw new Error("Could not retrieve Grade 7 learning content.");const d=await r.json();if(!Array.isArray(d))throw new Error("Grade 7 content format is invalid.");return d;};
export default async(request)=>{
 if(request.method!=="GET")return respond(405,{message:"Method not allowed."});
 const url=new URL(request.url),grade=Number(url.searchParams.get("grade")),resourceId=url.searchParams.get("resource_id");
 if(![7,8,9].includes(grade))return respond(400,{message:"Select Grade 7, 8 or 9."});
 const supabaseUrl=Netlify.env.get("SUPABASE_URL"),serviceKey=Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY"),publishableKey=Netlify.env.get("SUPABASE_PUBLISHABLE_KEY")||"sb_publishable_uaOcRVaIwnvRl_wZhMhJ-Q_DhrqZyS_";
 if(!supabaseUrl||!serviceKey||!publishableKey)return respond(500,{message:"Server configuration error."});
 try{
  let content,metadata;
  if(grade===7){content=await getGrade7(supabaseUrl,serviceKey);metadata=metaFor(7,content);}
  if(grade===8){content=grade8Content;metadata=grade8Metadata;}
  if(grade===9){content=grade9Content;metadata=grade9Metadata;}
  if(!resourceId)return respond(200,{success:true,grade,resources:metadata});
  const index=metadata.findIndex(item=>item.resource_id===resourceId);
  if(index<0)return respond(404,{message:"Learning topic not found."});
  const h=request.headers.get("authorization")||"",token=h.startsWith("Bearer ")?h.slice(7):"";
  if(!token)return respond(401,{message:"Sign in with your learner account to open this topic."});
  const auth=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{apikey:publishableKey,Authorization:`Bearer ${token}`}});
  if(!auth.ok)return respond(401,{message:"Your learner session has expired. Please sign in again."});
  const user=await auth.json();if(!user?.id)return respond(401,{message:"Learner account could not be verified."});
  const q=`${supabaseUrl}/rest/v1/entitlements?user_id=eq.${encodeURIComponent(user.id)}&product_id=eq.${encodeURIComponent(resourceId)}&active=eq.true&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=expires_at&order=expires_at.desc&limit=1`;
  const ar=await fetch(q,{headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`}});
  if(!ar.ok)throw new Error("Entitlement verification failed.");
  const access=await ar.json();if(!access.length)return respond(403,{message:"This topic is locked. Pay KES 10 to unlock it for 24 hours.",resource_id:resourceId});
  return respond(200,{success:true,resource:content[index],expires_at:access[0].expires_at});
 }catch(error){console.error(`Grade ${grade} learner content error:`,error.message);return respond(500,{message:"Unable to load this learning topic. Please try again."});}
};
