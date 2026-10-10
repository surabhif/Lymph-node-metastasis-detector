# Full-PCam CPU retrain. Same CamClassifier (ResNet-18, ImageNet norm, 96x96, 1-logit head) as repo.
import os, sys, time, json, math, numpy as np, h5py, torch, torch.nn as nn, torch.nn.functional as F
from torchvision import models
from sklearn.metrics import roc_auc_score
torch.set_num_threads(int(os.environ.get("THREADS", "8")))
D="/workspace/pcam"; O="/workspace/pcam_full"
EPOCHS=int(os.environ.get("EPOCHS","2")); BS=128; LR=float(os.environ.get("LR","3e-4")); BLOCK=4096
MAX_STEPS=int(os.environ.get("MAX_STEPS","0"))  # only for benchmarking
MEAN=torch.tensor([0.485,0.456,0.406]).view(1,3,1,1); STD=torch.tensor([0.229,0.224,0.225]).view(1,3,1,1)
class CamClassifier(nn.Module):
    def __init__(s, pretrained=True):
        super().__init__(); net=models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1 if pretrained else None)
        s.features=nn.Sequential(*list(net.children())[:-2]); s.classifier=nn.Linear(512,1)
    def forward(s,x): return s.classifier(F.adaptive_avg_pool2d(s.features(x),1).flatten(1)).squeeze(1)
def prep(xu8, aug, g=None):
    x=torch.from_numpy(xu8).permute(0,3,1,2).float().div_(255)
    if aug:
        n=x.shape[0]
        f=torch.rand(n,generator=g)<.5; x[f]=x[f].flip(3)
        f=torch.rand(n,generator=g)<.5; x[f]=x[f].flip(2)
        k=int(torch.randint(4,(1,),generator=g)); x=torch.rot90(x,k,(2,3))
        b=(torch.rand(n,1,1,1,generator=g)-.5)*0.2; c=1+(torch.rand(n,1,1,1,generator=g)-.5)*0.2
        m=x.mean((1,2,3),keepdim=True); x=((x-m)*c+m+b).clamp_(0,1)
    return ((x-MEAN)/STD).contiguous(memory_format=torch.channels_last)
def load_split(s):
    return h5py.File(f"{D}/camelyonpatch_level_2_split_{s}_x.h5","r")["x"], h5py.File(f"{D}/camelyonpatch_level_2_split_{s}_y.h5","r")["y"][:].reshape(-1).astype(np.float32)
@torch.no_grad()
def logits_of(model, X, bs=512):
    model.eval(); out=[]
    for i in range(0,len(X),bs): out.append(model(prep(X[i:i+bs],False)).float().numpy())
    return np.concatenate(out)
if __name__=="__main__":
    Xtr,ytr=load_split("train"); Xva,yva=load_split("valid"); N=len(ytr)
    print("train",N,"val",len(yva),flush=True)
    model=CamClassifier().to(memory_format=torch.channels_last)
    opt=torch.optim.AdamW(model.parameters(),lr=LR,weight_decay=1e-4)
    nb=math.ceil(N/BLOCK); steps_per_ep=sum(math.ceil(min(BLOCK,N-b*BLOCK)/BS) for b in range(nb)); total=EPOCHS*steps_per_ep
    sched=torch.optim.lr_scheduler.OneCycleLR(opt,max_lr=LR,total_steps=total,pct_start=0.05)
    ck=f"{O}/last.pt"; ep0=0; blk0=0; step=0; hist=[]; best=-1
    if os.path.exists(ck):
        c=torch.load(ck,weights_only=False); model.load_state_dict(c["model"]); opt.load_state_dict(c["opt"]); sched.load_state_dict(c["sched"])
        ep0,blk0,step,hist,best=c["ep"],c["blk"],c["step"],c["hist"],c["best"]; print("resumed",ep0,blk0,step,flush=True)
    crit=nn.BCEWithLogitsLoss(); t0=time.time()
    for ep in range(ep0,EPOCHS):
        rng=np.random.default_rng(1000+ep); order=rng.permutation(nb); g=torch.Generator().manual_seed(ep)
        for bi in range(blk0,nb):
            b=order[bi]; s=b*BLOCK; e=min(N,s+BLOCK); xb=Xtr[s:e]; yb=ytr[s:e]; p=rng.permutation(e-s)
            model.train(); tl=0
            for j in range(0,len(p),BS):
                idx=np.sort(p[j:j+BS]); x=prep(xb[idx],True,g); y=torch.from_numpy(yb[idx])
                with torch.autocast("cpu",dtype=torch.bfloat16,enabled=os.environ.get("BF16")=="1"):
                    out=model(x)
                loss=crit(out.float(),y); opt.zero_grad(set_to_none=True); loss.backward(); opt.step(); sched.step(); step+=1; tl+=loss.item()
                if MAX_STEPS and step>=MAX_STEPS: print(f"bench {step} steps {time.time()-t0:.1f}s => {(time.time()-t0)/step:.3f}s/step, est epoch {(time.time()-t0)/step*steps_per_ep/3600:.2f}h",flush=True); sys.exit()
            print(f"ep{ep} blk {bi+1}/{nb} step {step}/{total} loss {tl/math.ceil(len(p)/BS):.4f} lr {sched.get_last_lr()[0]:.2e} elapsed {(time.time()-t0)/60:.1f}m",flush=True)
            if (bi+1)%8==0 or bi+1==nb:
                torch.save(dict(model=model.state_dict(),opt=opt.state_dict(),sched=sched.state_dict(),ep=ep,blk=bi+1,step=step,hist=hist,best=best),ck+".tmp"); os.replace(ck+".tmp",ck)
        blk0=0
        lv=logits_of(model,Xva); auc=float(roc_auc_score(yva,lv)); acc=float(((lv>0)==yva).mean())
        hist.append(dict(epoch=ep+1,val_auc=auc,val_acc=acc,elapsed_min=(time.time()-t0)/60)); print("VAL",hist[-1],flush=True)
        if auc>best: best=auc; torch.save(dict(model=model.state_dict(),backbone="resnet18",epoch=ep+1,val_auc=auc),f"{O}/best_model.pt"); print("saved best",flush=True)
        torch.save(dict(model=model.state_dict(),opt=opt.state_dict(),sched=sched.state_dict(),ep=ep+1,blk=0,step=step,hist=hist,best=best),ck+".tmp"); os.replace(ck+".tmp",ck)
    json.dump(hist,open(f"{O}/train_history.json","w"),indent=2); print("TRAINDONE",flush=True)
