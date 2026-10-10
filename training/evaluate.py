import json, time, numpy as np, torch, torch.nn as nn, torch.nn.functional as F, onnx, onnxruntime as ort
from sklearn.metrics import roc_auc_score, roc_curve, confusion_matrix
from sklearn.linear_model import LogisticRegression
from onnxruntime.quantization import quantize_dynamic, QuantType
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from train import CamClassifier, load_split, logits_of, prep
O="/workspace/pcam_full"; torch.set_num_threads(8)
sig=lambda z:1/(1+np.exp(-z))
def nll(p,y): p=np.clip(p,1e-7,1-1e-7); return float(-(y*np.log(p)+(1-y)*np.log(1-p)).mean())
def ece(p,y,n=15):
    e=np.linspace(0,1,n+1); idx=np.clip(np.digitize(p,e)-1,0,n-1); tot=0; mce=0; bins=[]
    for b in range(n):
        m=idx==b
        if m.sum()==0: bins.append(dict(lo=float(e[b]),hi=float(e[b+1]),count=0)); continue
        conf=float(p[m].mean()); acc=float(y[m].mean()); gap=abs(conf-acc); tot+=m.mean()*gap; mce=max(mce,gap)
        bins.append(dict(lo=float(e[b]),hi=float(e[b+1]),count=int(m.sum()),mean_pred=conf,frac_pos=acc))
    return float(tot),float(mce),bins
def fit_T(z,y):
    zt=torch.tensor(z,dtype=torch.float64); yt=torch.tensor(y,dtype=torch.float64); lt=nn.Parameter(torch.zeros((),dtype=torch.float64))
    o=torch.optim.LBFGS([lt],lr=0.5,max_iter=100)
    def c():
        o.zero_grad(); l=F.binary_cross_entropy_with_logits(zt/lt.exp(),yt); l.backward(); return l
    o.step(c); return float(lt.exp())
def youden(y,s): f,t,th=roc_curve(y,s); return float(th[np.argmax(t-f)])
def band(y,s,t,target=0.9,maxf=0.2):  # same as notebook section 14
    order=np.argsort(np.abs(s-t)); n=len(s); best=(t,t,False)
    for k in range(1,int(maxf*n)+1, max(1,n//2000)):
        mask=np.ones(n,bool); mask[order[:k]]=False
        if ((s[mask]>=t)==y[mask]).mean()>=target: return float(s[order[:k]].min()),float(s[order[:k]].max()),True
        best=(float(s[order[:k]].min()),float(s[order[:k]].max()),False)
    return best
def full_metrics(p,y,t):
    pred=(p>=t).astype(int); tn,fp,fn,tp=confusion_matrix(y,pred).ravel(); e,m,bins=ece(p,y)
    return dict(n=int(len(y)),threshold=t,auc=float(roc_auc_score(y,p)),accuracy=float((pred==y).mean()),sensitivity=float(tp/(tp+fn)),specificity=float(tn/(tn+fp)),
        confusion=dict(tn=int(tn),fp=int(fp),fn=int(fn),tp=int(tp)),nll=nll(p,y),brier=float(((p-y)**2).mean()),ece15=e,mce15=m,ece10=ece(p,y,10)[0],reliability_bins_15=bins)
t0=time.time()
ck=torch.load(f"{O}/best_model.pt",weights_only=False); model=CamClassifier(False); model.load_state_dict(ck["model"]); model.eval()
Xv,yv=load_split("valid"); Xt,yt=load_split("test")
zv=logits_of(model,Xv).astype(np.float64); zt=logits_of(model,Xt).astype(np.float64)
np.savez(f"{O}/logits.npz",val=zv,val_y=yv,test=zt,test_y=yt)
T=fit_T(zv,yv); lr=LogisticRegression(C=1e6).fit(zv.reshape(-1,1),yv.astype(int)); a,b=float(lr.coef_[0,0]),float(lr.intercept_[0])
cands={"none":sig(zv),"temperature":sig(zv/T),"platt":sig(a*zv+b)}
calcmp={k:dict(val_nll=nll(p,yv),val_ece15=ece(p,yv)[0]) for k,p in cands.items()}
method=min(["temperature","platt"],key=lambda k:calcmp[k]["val_nll"])
cal=lambda z: sig(z/T) if method=="temperature" else sig(a*z+b)
pv,pt=cal(zv),cal(zt); thr=youden(yv,pv); lo,hi,reached=band(yv,pv,thr)
inb=(pt>=lo)&(pt<=hi); sel_acc=float(((pt[~inb]>=thr)==yt[~inb]).mean())
# sensitivity>=0.95 teaching operating point on val
f,tp_,th=roc_curve(yv,pv); i=np.argmax(tp_>=0.95); t95=float(th[i])
res=dict(model="ResNet-18 CamClassifier, ImageNet-pretrained, 96x96, ImageNet mean/std, 1-logit head",
  checkpoint_epoch=ck["epoch"],best_val_auc_raw=ck["val_auc"],
  calibration=dict(compared=calcmp,chosen=method,temperature_T=T,platt_a=a,platt_b=b,formula="sigmoid(z/T)" if method=="temperature" else "sigmoid(a*z+b)",note="z = logit = log(p/(1-p)) of ONNX 'probability' output"),
  threshold_youden_val=thr,uncertain_band_val=dict(lo=lo,hi=hi,target_selective_acc=0.9,max_flagged=0.2,target_reached_on_val=reached,val_flagged_frac=float(((pv>=lo)&(pv<=hi)).mean())),
  test_uncertain=dict(flagged_frac=float(inb.mean()),selective_accuracy_outside_band=sel_acc),
  test_raw_at_0p5=full_metrics(sig(zt),yt,0.5),test_calibrated_at_youden=full_metrics(pt,yt,thr),
  val_calibrated_at_youden=full_metrics(pv,yv,thr),
  teaching_point_sens95=dict(threshold_val=t95,test=full_metrics(pt,yt,t95)))
for k in ["test_raw_at_0p5","test_calibrated_at_youden","val_calibrated_at_youden"]: pass
# bootstrap AUC CI
rng=np.random.default_rng(0); bs=[roc_auc_score(yt[j],zt[j]) for j in (rng.integers(0,len(yt),len(yt)) for _ in range(200))]
res["test_auc_bootstrap95"]=[float(x) for x in np.percentile(bs,[2.5,97.5])]
# reliability diagram
fig,ax=plt.subplots(1,2,figsize=(10,4.5))
for axi,(name,p) in zip(ax,[("Raw (test)",sig(zt)),(f"Calibrated: {method} (test)",pt)]):
    _,_,bins=ece(p,yt); bb=[x for x in bins if x["count"]]
    axi.bar([(x["lo"]+x["hi"])/2 for x in bb],[x["frac_pos"] for x in bb],width=1/15,edgecolor="k",color="#9B5654",alpha=.8,label="observed")
    axi.plot([0,1],[0,1],"k--",lw=1); axi.set_title(f"{name}  ECE={ece(p,yt)[0]:.3f}"); axi.set_xlabel("predicted P(tumor)"); axi.set_ylabel("fraction tumor")
fig.tight_layout(); fig.savefig(f"{O}/reliability_diagram.png",dpi=130)
# ONNX export (same I/O as repo)
class W(nn.Module):
    def __init__(s,c): super().__init__(); s.c=c
    def forward(s,x):
        f=s.c.features(x); l=s.c.classifier(F.adaptive_avg_pool2d(f,1).flatten(1)); return torch.sigmoid(l),f,s.c.classifier.weight.squeeze(0)*1.0
w=W(model).eval(); fp=f"{O}/model_fp32.onnx"
torch.onnx.export(w,torch.randn(1,3,96,96),fp,input_names=["input"],output_names=["probability","features","cam_weights"],
  dynamic_axes={"input":{0:"batch"},"probability":{0:"batch"},"features":{0:"batch"}},opset_version=18,dynamo=False)
q=f"{O}/model.onnx"; quantize_dynamic(fp,q,weight_type=QuantType.QUInt8,extra_options={"WeightSymmetric":True})
xs=prep(Xt[:512],False).contiguous(); 
with torch.no_grad(): pt_ref=torch.sigmoid(model(xs)).numpy()
s32=ort.InferenceSession(fp,providers=["CPUExecutionProvider"]); s8=ort.InferenceSession(q,providers=["CPUExecutionProvider"])
o32=s32.run(None,{"input":xs.numpy()}); o8=s8.run(None,{"input":xs.numpy()})
# INT8 on full test
p8=np.concatenate([s8.run(["probability"],{"input":prep(Xt[i:i+512],False).contiguous().numpy()})[0].ravel() for i in range(0,len(yt),512)])
import os
res["onnx"]=dict(outputs=[o.name for o in s8.get_outputs()],fp32_mb=os.path.getsize(fp)/2**20,int8_mb=os.path.getsize(q)/2**20,
  fp32_vs_torch_max_abs=float(np.abs(o32[0].ravel()-pt_ref).max()),int8_vs_torch_max_abs_512=float(np.abs(o8[0].ravel()-pt_ref).max()),int8_vs_torch_mean_abs_512=float(np.abs(o8[0].ravel()-pt_ref).mean()),
  features_shape=list(o8[1].shape),cam_weights_shape=list(o8[2].shape),int8_test_auc_raw=float(roc_auc_score(yt,p8)),int8_test_acc_raw_0p5=float(((p8>=.5)==yt).mean()))
res["eval_seconds"]=time.time()-t0
json.dump(res,open(f"{O}/metrics.json","w"),indent=2)
json.dump(dict(method=method,temperature_T=T,platt_a=a,platt_b=b,threshold=thr,uncertain_lo=lo,uncertain_hi=hi),open(f"{O}/calibration.json","w"),indent=2)
print(json.dumps({k:v for k,v in res.items() if "metrics" not in k},indent=1,default=str)[:6000])
