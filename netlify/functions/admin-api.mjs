const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
});

export default async (request) => {
  const url = Netlify.env.get("SUPABASE_URL");
  const serviceKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = Netlify.env.get("SUPABASE_PUBLISHABLE_KEY");
  const adminIds = (Netlify.env.get("JSLH_ADMIN_USER_IDS") || "").split(",").map(x => x.trim()).filter(Boolean);
  if (!url || !serviceKey || !publishableKey || !adminIds.length) {
  return json(503, {
    error: "Administrator service is not configured. Check the Supabase environment variables and administrator IDs."
  });
}
  if (!["GET","POST"].includes(request.method)) return json(405,{error:"Method not allowed."});
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if (!token) return json(401,{error:"Please sign in."});
  const auth=await fetch(`${url}/auth/v1/user`,{headers:{apikey:publishableKey,Authorization:`Bearer ${token}`}});
  if (!auth.ok) return json(401,{error:"Your session is invalid. Sign in again."});
  const actor=await auth.json();
  if (!adminIds.includes(actor.id)) return json(403,{error:"Administrator access denied."});
  
const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json"
};

  const rest=async(path,opts={})=>fetch(`${url}/rest/v1/${path}`,{...opts,headers:{...headers,...(opts.headers||{})}});
  const log=async(action,targetId=null,details={})=>{
    try { await rest("admin_activity_logs",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({admin_id:actor.id,action,target_user_id:targetId,details})}); } catch {}
  };
  try {
    if(request.method==="GET") {
      const mode=new URL(request.url).searchParams.get("view")||"overview";
      if(mode==="activity") {
        const r=await rest("admin_activity_logs?select=id,action,target_user_id,details,created_at&order=created_at.desc&limit=100");
        if(!r.ok) return json(200,{items:[],warning:"Activity log table is not installed yet. Run supabase/admin-dashboard.sql."});
        return json(200,{items:await r.json()});
      }
      const [usersRes,profilesRes,logsRes]=await Promise.all([
        fetch(`${url}/auth/v1/admin/users?page=1&per_page=1000`,{headers}),
        rest("tuition_profiles?select=id,full_name,grade,phone,role,created_at,updated_at&order=created_at.desc"),
        rest("admin_activity_logs?select=id,action,target_user_id,details,created_at&order=created_at.desc&limit=12")
      ]);
      if(!usersRes.ok) return json(502,{error:"Could not retrieve account list."});
      if(!profilesRes.ok) return json(500,{error:"Could not read tuition_profiles. Confirm the Tuition Centre database setup."});
      const authData=await usersRes.json(), profiles=await profilesRes.json();
      const authUsers=authData.users||[];
      const merged=profiles.map(p=>({...p,email:authUsers.find(u=>u.id===p.id)?.email||"",last_sign_in_at:authUsers.find(u=>u.id===p.id)?.last_sign_in_at||null,banned_until:authUsers.find(u=>u.id===p.id)?.banned_until||null}));
      return json(200,{stats:{users:merged.length,learners:merged.filter(x=>x.role==="learner").length,teachers:merged.filter(x=>x.role==="teacher").length,admins:merged.filter(x=>x.role==="admin").length},users:merged,recent:logsRes.ok?await logsRes.json():[],admin:{id:actor.id,email:actor.email}});
    }
    const body=await request.json();
    const action=body.action;
    if(action==="create_teacher") {
      const {email,password,full_name,phone,grade,subject}=body;
      if(!email||!password||password.length<8||!full_name||!grade||!subject) return json(400,{error:"Enter teacher name, email, password (at least 8 characters), grade and subject."});
      const created=await fetch(`${url}/auth/v1/admin/users`,{method:"POST",headers,body:JSON.stringify({email,password,email_confirm:true,user_metadata:{full_name,role:"teacher"}})});
      const result=await created.json();
      if(!created.ok) return json(created.status,{error:result.msg||result.message||result.error_description||"Teacher account could not be created."});
      const profile=await rest("tuition_profiles?on_conflict=id",{method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({id:result.id,full_name,phone:phone||null,role:"teacher"})});
      if(!profile.ok) return json(500,{error:"Teacher login was created but profile setup failed. Contact support before retrying."});
      const assignment=await rest("tuition_teacher_assignments",{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({teacher_id:result.id,grade,subject})});
      if(!assignment.ok) return json(500,{error:"Teacher created, but grade/subject assignment failed. Check the tuition_teacher_assignments table."});
      await log("teacher_created_and_assigned",result.id,{full_name,grade,subject});
      return json(200,{success:true,message:"Teacher account created and assigned.",user_id:result.id});
    }
    if(action==="set_password") {
      const {user_id,password}=body;
      if(!user_id||!password||password.length<8) return json(400,{error:"Enter a new password of at least 8 characters."});
      const r=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(user_id)}`,{method:"PUT",headers,body:JSON.stringify({password})});
      if(!r.ok) return json(400,{error:"Password could not be changed."});
      await log("password_reset",user_id,{});
      return json(200,{success:true,message:"Password updated."});
    }
    if(action==="set_account_status") {
      const {user_id,active}=body;
      if(!user_id||typeof active!=="boolean") return json(400,{error:"Invalid account status request."});
      const r=await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(user_id)}`,{method:"PUT",headers,body:JSON.stringify({ban_duration:active?"none":"876000h"})});
      if(!r.ok) return json(400,{error:"Account status could not be changed."});
      await log(active?"account_activated":"account_suspended",user_id,{});
      return json(200,{success:true,message:active?"Account activated.":"Account suspended."});
    }
    if(action==="assign_teacher") {
      const {teacher_id,grade,subject}=body;
      if(!teacher_id||!grade||!subject) return json(400,{error:"Choose teacher, grade and subject."});
      const role=await rest(`tuition_profiles?id=eq.${encodeURIComponent(teacher_id)}&select=id,role`);
      const rows=role.ok?await role.json():[];
      if(!rows.length||!["teacher","admin"].includes(rows[0].role)) return json(400,{error:"Selected account is not a teacher."});
      const r=await rest("tuition_teacher_assignments",{method:"POST",headers:{...headers,Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({teacher_id,grade,subject})});
      if(!r.ok) return json(400,{error:"Could not save teacher assignment."});
      await log("teacher_assignment_added",teacher_id,{grade,subject});
      return json(200,{success:true,message:"Teacher assignment saved."});
    }
    return json(400,{error:"Unknown administrator action."});
  } catch(e) {
    console.error("Admin API:",e);
    return json(500,{error:"Administrator request failed. Check server configuration and database migrations."});
  }
};
