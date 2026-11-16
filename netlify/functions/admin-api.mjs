const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});
const safeText = (v,n=180) => typeof v==="string" ? v.trim().slice(0,n) : "";
const validRole = role => ["learner","teacher","admin"].includes(role);

export default async request => {
  const url=Netlify.env.get("SUPABASE_URL");
  const serviceKey=Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey=Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  const bootstrapIds=(Netlify.env.get("JSLH_ADMIN_USER_IDS")||"").split(",").map(x=>x.trim()).filter(Boolean);
  if(!url||!serviceKey||!publishableKey) return json(503,{error:"Administrator service is not configured."});
  if(!["GET","POST"].includes(request.method)) return json(405,{error:"Method not allowed."});
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return json(401,{error:"Please sign in."});
  const auth=await fetch(`${url}/auth/v1/user`,{headers:{apikey:publishableKey,Authorization:`Bearer ${token}`}});
  if(!auth.ok) return json(401,{error:"Your session is invalid. Sign in again."});
  const actor=await auth.json();
  const headers={apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"};
  const rest=(path,opts={})=>fetch(`${url}/rest/v1/${path}`,{...opts,headers:{...headers,...(opts.headers||{})}});
  const authAdmin=(path,opts={})=>fetch(`${url}/auth/v1/admin/${path}`,{...opts,headers:{...headers,...(opts.headers||{})}});
  const access=await rest(`admin_access?user_id=eq.${encodeURIComponent(actor.id)}&select=user_id`);
  const accessRows=access.ok?await access.json():[];
  if(!bootstrapIds.includes(actor.id)&&!accessRows.length) return json(403,{error:"Administrator access denied."});
  const log=async(action,targetId=null,details={})=>{
    try { const r=await rest("admin_activity_logs",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({admin_id:actor.id,action,target_user_id:targetId,details})}); if(!r.ok) console.error("Administrator audit log insert failed",r.status); }
    catch(error){ console.error("Administrator audit log unavailable",error); }
  };
  const getUsers=async()=>{
    const [ur,pr]=await Promise.all([authAdmin("users?page=1&per_page=1000"),rest("tuition_profiles?select=id,full_name,grade,phone,guardian_name,guardian_phone,role,created_at,updated_at&order=created_at.desc")]);
    if(!ur.ok||!pr.ok) throw new Error("Could not retrieve account list.");
    const au=(await ur.json()).users||[], profiles=await pr.json();
    return profiles.map(p=>{const u=au.find(x=>x.id===p.id)||{};return {...p,email:u.email||"",last_sign_in_at:u.last_sign_in_at||null,banned_until:u.banned_until||null,confirmed_at:u.email_confirmed_at||null};});
  };
  try{
    if(request.method==="GET"){
      const mode=new URL(request.url).searchParams.get("view")||"overview";
      if(mode==="activity"){
        const [events,admins,profiles]=await Promise.all([
          rest("site_activity_events?select=id,visitor_id,user_id,event_type,page_path,resource_id,resource_title,resource_category,access_type,grade,metadata,created_at&order=created_at.desc&limit=500"),
          rest("admin_activity_logs?select=id,admin_id,action,target_user_id,details,created_at&order=created_at.desc&limit=200"),
          rest("tuition_profiles?select=id,full_name,role")
        ]);
        return json(200,{events:events.ok?await events.json():[],admin_actions:admins.ok?await admins.json():[],profiles:profiles.ok?await profiles.json():[],warning:!events.ok?"Site activity table unavailable. Apply supabase/site-activity-analytics.sql.":null});
      }
      if(mode==="payments"){
        const [payments,mpesa,orders,entitlements,premiumEntitlements,premiumAccess]=await Promise.all([
          rest("payments?select=id,user_id,phone,amount,product_id,status,mpesa_receipt,result_desc,created_at,updated_at&order=created_at.desc&limit=500"),
          rest("mpesa_payments?select=id,user_id,phone_number,amount,currency,account_reference,status,mpesa_receipt_number,created_at,updated_at&order=created_at.desc&limit=500"),
          rest("teacher_download_orders?select=id,user_id,grade,resource_id,subject,resource_type,period,amount,status,download_count,paid_at,downloaded_at,created_at&order=created_at.desc&limit=500"),
          rest("entitlements?select=id,user_id,product_id,active,expires_at,created_at&order=created_at.desc&limit=500"),
          rest("premium_entitlements?select=id,user_id,product_name,starts_at,expires_at,created_at&order=created_at.desc&limit=500"),
          rest("premium_access?select=id,user_id,library_key,expires_at,last_payment_reference,updated_at&order=updated_at.desc&limit=500")
        ]);
        return json(200,{payments:payments.ok?await payments.json():[],mpesa:mpesa.ok?await mpesa.json():[],orders:orders.ok?await orders.json():[],entitlements:entitlements.ok?await entitlements.json():[],premium_entitlements:premiumEntitlements.ok?await premiumEntitlements.json():[],premium_access:premiumAccess.ok?await premiumAccess.json():[]});
      }
      const [users,logs,events]=await Promise.all([
        getUsers(),
        rest("admin_activity_logs?select=id,action,target_user_id,details,created_at&order=created_at.desc&limit=12"),
        rest("site_activity_events?select=id,event_type,visitor_id,user_id,created_at&order=created_at.desc&limit=1000")
      ]);
      const ev=events.ok?await events.json():[];
      const now=Date.now(),day=86400000;
      const recent=ev.filter(x=>now-new Date(x.created_at).getTime()<day);
      return json(200,{stats:{users:users.length,learners:users.filter(x=>x.role==="learner").length,teachers:users.filter(x=>x.role==="teacher").length,admins:users.filter(x=>x.role==="admin").length,visitors_today:new Set(recent.map(x=>x.visitor_id)).size,events_today:recent.length,resource_views_today:recent.filter(x=>["resource_view","resource_open","resource_download"].includes(x.event_type)).length},users,recent:logs.ok?await logs.json():[],admin:{id:actor.id,email:actor.email}});
    }
    const body=await request.json();
    const action=body.action;
    if(action==="create_member"){
      const role=safeText(body.role,20),email=safeText(body.email,254).toLowerCase(),password=typeof body.password==="string"?body.password:"",full_name=safeText(body.full_name,140);
      const grade=safeText(body.grade,30),phone=safeText(body.phone,40);
      if(!validRole(role)||!email||!full_name||password.length<8) return json(400,{error:"Enter a valid role, name, email and password of at least 8 characters."});
      if(role==="learner"&&!["Grade 7","Grade 8","Grade 9"].includes(grade)) return json(400,{error:"Choose Grade 7, Grade 8 or Grade 9."});
      const created=await authAdmin("users",{method:"POST",body:JSON.stringify({email,password,email_confirm:true,user_metadata:{full_name}})});
      const u=await created.json();
      if(!created.ok) return json(created.status,{error:u.msg||u.message||u.error_description||"Account could not be created."});
      const profile=await rest("tuition_profiles?on_conflict=id",{method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({id:u.id,full_name,grade:grade||null,phone:phone||null,guardian_name:safeText(body.guardian_name,140)||null,guardian_phone:safeText(body.guardian_phone,40)||null,role})});
      if(!profile.ok){await authAdmin(`users/${u.id}`,{method:"DELETE"});return json(500,{error:"Account was rolled back because profile creation failed."});}
      if(role==="admin"){
        const grant=await rest("admin_access",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({user_id:u.id,granted_by:actor.id})});
        if(!grant.ok){await rest(`tuition_profiles?id=eq.${u.id}`,{method:"DELETE"});await authAdmin(`users/${u.id}`,{method:"DELETE"});return json(500,{error:"Administrator access could not be granted; account creation was rolled back."});}
      }
      await log("member_created",u.id,{role,full_name,email});
      return json(200,{success:true,message:`${role[0].toUpperCase()+role.slice(1)} account created.`,user_id:u.id});
    }
    if(action==="create_teacher"){
      const {email,password,full_name,phone,grade,subject}=body;
      if(!email||!password||password.length<8||!full_name||!grade||!subject) return json(400,{error:"Enter teacher name, email, password (at least 8 characters), grade and subject."});
      const created=await authAdmin("users",{method:"POST",body:JSON.stringify({email,password,email_confirm:true,user_metadata:{full_name}})});
      const result=await created.json();
      if(!created.ok) return json(created.status,{error:result.msg||result.message||result.error_description||"Teacher account could not be created."});
      const profile=await rest("tuition_profiles?on_conflict=id",{method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({id:result.id,full_name,phone:phone||null,role:"teacher"})});
      if(!profile.ok){await authAdmin(`users/${result.id}`,{method:"DELETE"});return json(500,{error:"Teacher profile failed; account rolled back."});}
      const assignment=await rest("tuition_teacher_assignments",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({teacher_id:result.id,grade,subject})});
      if(!assignment.ok)return json(500,{error:"Teacher created, but grade/subject assignment failed."});
      await log("teacher_created_and_assigned",result.id,{full_name,grade,subject});
      return json(200,{success:true,message:"Teacher account created and assigned.",user_id:result.id});
    }
    if(action==="send_password_reset"){
      const {user_id}=body;
      const profile=await rest(`tuition_profiles?id=eq.${encodeURIComponent(user_id)}&select=id`);
      if(!profile.ok||!(await profile.json()).length)return json(404,{error:"Member not found."});
      const userRes=await authAdmin(`users/${encodeURIComponent(user_id)}`);
      if(!userRes.ok)return json(404,{error:"Could not find the member's login."});
      const user=await userRes.json();
      const sent=await fetch(`${url}/auth/v1/recover`,{method:"POST",headers:{apikey:publishableKey,"Content-Type":"application/json"},body:JSON.stringify({email:user.email})});
      if(!sent.ok)return json(502,{error:"Password reset email could not be sent. Check Supabase email settings."});
      await log("password_reset_email_sent",user_id,{});
      return json(200,{success:true,message:"Password reset email sent."});
    }
    if(action==="set_password"){
      const {user_id,password}=body;
      if(!user_id||!password||password.length<8)return json(400,{error:"Enter a new password of at least 8 characters."});
      const r=await authAdmin(`users/${encodeURIComponent(user_id)}`,{method:"PUT",body:JSON.stringify({password})});
      if(!r.ok)return json(400,{error:"Password could not be changed."});
      await log("password_reset_by_admin",user_id,{});
      return json(200,{success:true,message:"Password updated."});
    }
    if(action==="update_member"){
      const {user_id}=body;
      if(!user_id)return json(400,{error:"Member id is required."});
      const patch={};
      for(const key of ["full_name","grade","phone","guardian_name","guardian_phone"])if(key in body)patch[key]=safeText(body[key],key.includes("phone")?40:140)||null;
      if(!Object.keys(patch).length)return json(400,{error:"No profile changes supplied."});
      patch.updated_at=new Date().toISOString();
      const r=await rest(`tuition_profiles?id=eq.${encodeURIComponent(user_id)}`,{method:"PATCH",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify(patch)});
      if(!r.ok)return json(400,{error:"Member details could not be updated."});
      await log("member_profile_updated",user_id,{fields:Object.keys(patch)});
      return json(200,{success:true,message:"Member details updated."});
    }
    if(action==="delete_member"){
      const {user_id}=body;
      if(!user_id||user_id===actor.id)return json(400,{error:"You cannot delete your own administrator account."});
      const profile=await rest(`tuition_profiles?id=eq.${encodeURIComponent(user_id)}&select=role`);
      const rows=profile.ok?await profile.json():[];
      if(!rows.length)return json(404,{error:"Member not found."});
      if(rows[0].role==="admin")return json(403,{error:"Administrator accounts cannot be deleted from this screen."});
      await log("member_deleted",user_id,{});
      const r=await authAdmin(`users/${encodeURIComponent(user_id)}`,{method:"DELETE"});
      if(!r.ok)return json(400,{error:"Member account could not be deleted."});
      return json(200,{success:true,message:"Member account deleted."});
    }
    if(action==="set_account_status"){
      const {user_id,active}=body;
      if(!user_id||typeof active!=="boolean")return json(400,{error:"Invalid account status request."});
      const roleCheck=await rest(`tuition_profiles?id=eq.${encodeURIComponent(user_id)}&select=role`);
      const roleRows=roleCheck.ok?await roleCheck.json():[];
      if(!roleRows.length)return json(404,{error:"Member not found."});
      if(roleRows[0].role==="admin")return json(403,{error:"Administrator accounts cannot be suspended from this screen."});
      const r=await authAdmin(`users/${encodeURIComponent(user_id)}`,{method:"PUT",body:JSON.stringify({ban_duration:active?"none":"876000h"})});
      if(!r.ok)return json(400,{error:"Account status could not be changed."});
      await log(active?"account_activated":"account_suspended",user_id,{});
      return json(200,{success:true,message:active?"Account activated.":"Account suspended."});
    }
    if(action==="assign_teacher"){
      const {teacher_id,grade,subject}=body;
      if(!teacher_id||!grade||!subject)return json(400,{error:"Choose teacher, grade and subject."});
      const role=await rest(`tuition_profiles?id=eq.${encodeURIComponent(teacher_id)}&select=id,role`);
      const rows=role.ok?await role.json():[];
      if(!rows.length||!["teacher","admin"].includes(rows[0].role))return json(400,{error:"Selected account is not a teacher."});
      const r=await rest("tuition_teacher_assignments",{method:"POST",headers:{...headers,Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({teacher_id,grade,subject})});
      if(!r.ok)return json(400,{error:"Could not save teacher assignment."});
      await log("teacher_assignment_added",teacher_id,{grade,subject});
      return json(200,{success:true,message:"Teacher assignment saved."});
    }
    return json(400,{error:"Unknown administrator action."});
  }catch(e){console.error("Admin API:",e);return json(500,{error:"Administrator request failed. Check server configuration and database migrations."});}
};
