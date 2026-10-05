"use strict";

/* Toolora Professional Photo Editor
   Browser-only image editor.
   No fake AI operations are used.
*/

const $ = id => document.getElementById(id);

const imageCanvas = $("imageCanvas");
const overlayCanvas = $("overlayCanvas");
const imageCtx = imageCanvas.getContext("2d", { willReadFrequently:true });
const overlayCtx = overlayCanvas.getContext("2d");

const state = {
    image:null,
    sourceCanvas:null,
    sourceWidth:0,
    sourceHeight:0,

    tool:"light",
    before:false,

    zoom:1,
    panX:0,
    panY:0,

    light:{
        exposure:0,
        contrast:0,
        highlights:0,
        shadows:0,
        whites:0,
        blacks:0
    },

    color:{
        temperature:0,
        tint:0,
        vibrance:0,
        saturation:0,

        hue:0,
        hueRange:30,
        mixerSaturation:0,
        mixerLightness:0,

        shadowHue:0,
        shadowSat:0,
        midHue:0,
        midSat:0,
        highlightHue:0,
        highlightSat:0,
        gradeBlend:50,
        gradeBalance:0
    },

    effects:{
        texture:0,
        clarity:0,
        dehaze:0,
        vignette:0,
        midpoint:50,
        feather:50,
        roundness:0,
        grain:0,
        grainSize:25,
        grainRoughness:50
    },

    detail:{
        sharpening:0,
        radius:1,
        detail:25,
        masking:0,
        noiseReduction:0,
        noiseDetail:50,
        noiseContrast:0,
        colorNoise:0,
        colorDetail:50,
        smoothness:50
    },

    crop:{
        ratio:"Free",
        x:0,
        y:0,
        w:1,
        h:1,
        active:false,
        dragging:false,
        resizing:false,
        handle:"",
        startX:0,
        startY:0,
        startCrop:null,
        straighten:0
    },

    text:{
        value:"",
        font:"Arial",
        size:48,
        opacity:100,
        bold:false,
        italic:false,
        align:"center",
        color:"#ffffff",
        stroke:"#000000",
        strokeWidth:0,
        layers:[],
        selected:-1
    },

    draw:{
        size:12,
        opacity:100,
        color:"#ffffff",
        strokes:[],
        drawing:false,
        current:null
    },

    selective:{
        picked:null,
        range:30,
        hue:0,
        saturation:0,
        lightness:0
    },

    preset:{
        name:"None",
        amount:100
    },

    profile:"Basic",

    mask:{
        type:"None",
        amount:50,
        feather:50,
        exposure:0,
        contrast:0,
        saturation:0,
        hue:0,
        texture:0,
        clarity:0,
        dehaze:0,
        x:50,
        y:50,
        width:70,
        height:70
    },

    retouch:{
        size:30,
        feather:70,
        opacity:100,
        strokes:[]
    },

    blur:{
        amount:0,
        focusX:50,
        focusY:50,
        focusSize:40,
        feather:50
    },

    optics:{
        vignette:0,
        defringe:0,
        distortion:0
    },

    history:[],
    future:[],

    gesture:{
        active:false,
        lastX:0,
        lastY:0,
        startDistance:0,
        startZoom:1
    }
};

const profiles = {
    Basic:{},
    Modern:{contrast:8,saturation:5,clarity:5},
    Vivid:{contrast:10,saturation:18,vibrance:20},
    Portrait:{highlights:-8,shadows:12,saturation:4,clarity:-4},
    Cinematic:{contrast:12,saturation:-8,vibrance:4,dehaze:7},
    Vintage:{contrast:-8,saturation:-10,grain:10,vignette:10},
    Matte:{contrast:-12,blacks:18,saturation:-5},
    B&W:{saturation:-100,contrast:8},
    Cool:{temperature:-18,shadowsHue:210,shadowsSat:10},
    Warm:{temperature:18,highlightsHue:35,highlightsSat:12}
};

function clamp(v,min=0,max=255){
    return Math.max(min,Math.min(max,v));
}

function clamp01(v){
    return Math.max(0,Math.min(1,v));
}

function lerp(a,b,t){
    return a+(b-a)*t;
}

function value(id){
    const el=$(id);
    return el ? Number(el.value) : 0;
}

function fmt(v){
    return Number(v).toFixed(0);
}

function snapshot(){
    if(!state.sourceCanvas) return;

    const snap={
        image:imageCanvas.toDataURL("image/png"),
        text:JSON.parse(JSON.stringify(state.text.layers)),
        draw:JSON.parse(JSON.stringify(state.draw.strokes)),
        retouch:JSON.parse(JSON.stringify(state.retouch.strokes)),
        crop:JSON.parse(JSON.stringify(state.crop))
    };

    state.history.push(snap);

    if(state.history.length>30){
        state.history.shift();
    }

    state.future=[];
    updateHistoryButtons();
}

function restoreSnapshot(snap){
    const img=new Image();

    img.onload=()=>{
        state.sourceCanvas=document.createElement("canvas");
        state.sourceCanvas.width=img.width;
        state.sourceCanvas.height=img.height;

        const c=state.sourceCanvas.getContext("2d");
        c.drawImage(img,0,0);

        imageCanvas.width=img.width;
        imageCanvas.height=img.height;

        state.text.layers=JSON.parse(JSON.stringify(snap.text||[]));
        state.draw.strokes=JSON.parse(JSON.stringify(snap.draw||[]));
        state.retouch.strokes=JSON.parse(JSON.stringify(snap.retouch||[]));
        state.crop=JSON.parse(JSON.stringify(snap.crop||state.crop));

        render();
        updateHistoryButtons();
    };

    img.src=snap.image;
}

function undo(){
    if(!state.history.length) return;

    const current={
        image:imageCanvas.toDataURL("image/png"),
        text:JSON.parse(JSON.stringify(state.text.layers)),
        draw:JSON.parse(JSON.stringify(state.draw.strokes)),
        retouch:JSON.parse(JSON.stringify(state.retouch.strokes)),
        crop:JSON.parse(JSON.stringify(state.crop))
    };

    state.future.push(current);

    const snap=state.history.pop();
    restoreSnapshot(snap);
}

function redo(){
    if(!state.future.length) return;

    const current={
        image:imageCanvas.toDataURL("image/png"),
        text:JSON.parse(JSON.stringify(state.text.layers)),
        draw:JSON.parse(JSON.stringify(state.draw.strokes)),
        retouch:JSON.parse(JSON.stringify(state.retouch.strokes)),
        crop:JSON.parse(JSON.stringify(state.crop))
    };

    state.history.push(current);

    const snap=state.future.pop();
    restoreSnapshot(snap);
}

function updateHistoryButtons(){
    $("undoBtn").disabled=!state.history.length;
    $("redoBtn").disabled=!state.future.length;
}

function setStatus(text){
    $("statusText").textContent=text;
}

function openFile(file){
    if(!file || !file.type.startsWith("image/")) return;

    const reader=new FileReader();

    reader.onload=e=>{
        const img=new Image();

        img.onload=()=>{
            const max=1800;
            const scale=Math.min(1,max/Math.max(img.width,img.height));

            const w=Math.max(1,Math.round(img.width*scale));
            const h=Math.max(1,Math.round(img.height*scale));

            state.sourceCanvas=document.createElement("canvas");
            state.sourceCanvas.width=w;
            state.sourceCanvas.height=h;

            const c=state.sourceCanvas.getContext("2d");
            c.imageSmoothingEnabled=true;
            c.imageSmoothingQuality="high";
            c.drawImage(img,0,0,w,h);

            imageCanvas.width=w;
            imageCanvas.height=h;
            overlayCanvas.width=w;
            overlayCanvas.height=h;

            state.image=img;
            state.sourceWidth=w;
            state.sourceHeight=h;

            state.crop={
                ratio:"Free",
                x:0,
                y:0,
                w:1,
                h:1,
                active:false,
                dragging:false,
                resizing:false,
                handle:"",
                startX:0,
                startY:0,
                startCrop:null,
                straighten:0
            };

            state.history=[];
            state.future=[];
            state.text.layers=[];
            state.draw.strokes=[];
            state.retouch.strokes=[];
            state.text.selected=-1;
            state.selective.picked=null;

            $("emptyState").style.display="none";

            $("imageInfo").textContent=`${img.width} × ${img.height}px`;
            setStatus("Image loaded");

            fitImage();
            render();
            updateHistoryButtons();
        };

        img.src=e.target.result;
    };

    reader.readAsDataURL(file);
}

$("openBtn").onclick=()=>$("fileInput").click();
$("openEmptyBtn").onclick=()=>$("fileInput").click();

$("fileInput").onchange=e=>{
    openFile(e.target.files[0]);
    e.target.value="";
};

$("backBtn").onclick=()=>{
    window.location.href="index.html";
};

$("undoBtn").onclick=undo;
$("redoBtn").onclick=redo;

$("beforeBtn").onclick=()=>{
    state.before=!state.before;
    $("beforeBtn").textContent=state.before?"After":"Before";
    render();
};

document.addEventListener("dragover",e=>e.preventDefault());

document.addEventListener("drop",e=>{
    e.preventDefault();

    if(e.dataTransfer.files.length){
        openFile(e.dataTransfer.files[0]);
    }
});

function fitImage(){
    if(!state.sourceCanvas) return;

    const rect=$("stage").getBoundingClientRect();

    const sx=(rect.width-30)/imageCanvas.width;
    const sy=(rect.height-30)/imageCanvas.height;

    state.zoom=Math.max(.05,Math.min(sx,sy));
    state.panX=0;
    state.panY=0;

    updateTransform();
}

function updateTransform(){
    imageCanvas.style.transform=
        `translate3d(${state.panX}px,${state.panY}px,0) scale(${state.zoom})`;

    overlayCanvas.style.transform=
        `translate3d(${state.panX}px,${state.panY}px,0) scale(${state.zoom})`;

    $("zoomLabel").textContent=`${Math.round(state.zoom*100)}%`;
}

$("zoomIn").onclick=()=>{
    state.zoom=Math.min(5,state.zoom*1.2);
    updateTransform();
};

$("zoomOut").onclick=()=>{
    state.zoom=Math.max(.2,state.zoom/1.2);
    updateTransform();
};

$("fitBtn").onclick=fitImage;

$("fullBtn").onclick=()=>{
    state.zoom=1;
    state.panX=0;
    state.panY=0;
    updateTransform();
};

function distance(a,b){
    return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
}

$("stage").addEventListener("pointerdown",e=>{
    if(!state.sourceCanvas) return;

    if(state.tool==="text"){
        handleTextPointerDown(e);
        return;
    }

    if(state.tool==="draw"){
        startDraw(e);
        return;
    }

    if(state.tool==="retouch"){
        startRetouch(e);
        return;
    }

    if(state.tool==="selective"){
        pickColor(e);
        return;
    }

    if(state.tool==="crop"){
        startCropPointer(e);
        return;
    }

    state.gesture.active=true;
    state.gesture.lastX=e.clientX;
    state.gesture.lastY=e.clientY;

    $("stage").setPointerCapture?.(e.pointerId);
});

$("stage").addEventListener("pointermove",e=>{
    if(!state.sourceCanvas) return;

    if(state.tool==="text"){
        moveTextPointer(e);
        return;
    }

    if(state.tool==="draw"){
        continueDraw(e);
        return;
    }

    if(state.tool==="retouch"){
        continueRetouch(e);
        return;
    }

    if(state.tool==="crop"){
        moveCropPointer(e);
        return;
    }

    if(!state.gesture.active) return;

    const dx=e.clientX-state.gesture.lastX;
    const dy=e.clientY-state.gesture.lastY;

    state.panX+=dx;
    state.panY+=dy;

    state.gesture.lastX=e.clientX;
    state.gesture.lastY=e.clientY;

    updateTransform();
});

$("stage").addEventListener("pointerup",e=>{
    if(state.tool==="draw"){
        finishDraw();
        return;
    }

    if(state.tool==="retouch"){
        finishRetouch();
        return;
    }

    if(state.tool==="crop"){
        finishCropPointer();
        return;
    }

    state.gesture.active=false;
});

$("stage").addEventListener("pointercancel",()=>{
    state.gesture.active=false;
    state.draw.drawing=false;
    state.retouch.drawing=false;
});

$("stage").addEventListener("wheel",e=>{
    if(!state.sourceCanvas) return;

    e.preventDefault();

    state.zoom*=e.deltaY<0?1.08:.92;
    state.zoom=Math.max(.2,Math.min(5,state.zoom));

    updateTransform();
},{passive:false});

function canvasPoint(e){
    const rect=imageCanvas.getBoundingClientRect();

    return {
        x:(e.clientX-rect.left)/rect.width*imageCanvas.width,
        y:(e.clientY-rect.top)/rect.height*imageCanvas.height
    };
}

function buildControl(label,id,min,max,step,val,suffix="",callback){
    return `
    <div class="control">
        <div class="control-head">
            <label>${label}</label>
            <span class="value" id="${id}Value">${fmt(val)}${suffix}</span>
        </div>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}">
    </div>`;
}

function bindRange(id,callback,suffix=""){
    const el=$(id);
    if(!el) return;

    const out=$(id+"Value");

    const update=()=>{
        const v=Number(el.value);

        if(out) out.textContent=fmt(v)+suffix;

        callback(v);
        render();
    };

    el.addEventListener("input",update);

    el.addEventListener("change",()=>{
        snapshot();
        update();
    });
}

function panel(title,description,body){
    return `
        <h2 class="panel-title">${title}</h2>
        <p class="panel-description">${description}</p>
        ${body}
    `;
}

function renderPanel(tool){
    const c=$("controls");

    if(tool==="light"){
        c.innerHTML=panel(
            "Light",
            "Adjust brightness, contrast and tonal range.",
            `<div class="control-group">
                <h3 class="group-title">Tone</h3>
                ${buildControl("Exposure","exposure",-100,100,1,0)}
                ${buildControl("Contrast","contrast",-100,100,1,0)}
                ${buildControl("Highlights","highlights",-100,100,1,0)}
                ${buildControl("Shadows","shadows",-100,100,1,0)}
                ${buildControl("Whites","whites",-100,100,1,0)}
                ${buildControl("Blacks","blacks",-100,100,1,0)}
            </div>
            <button id="autoLight" class="action-btn primary">Auto Light</button>`
        );

        bindRange("exposure",v=>state.light.exposure=v);
        bindRange("contrast",v=>state.light.contrast=v);
        bindRange("highlights",v=>state.light.highlights=v);
        bindRange("shadows",v=>state.light.shadows=v);
        bindRange("whites",v=>state.light.whites=v);
        bindRange("blacks",v=>state.light.blacks=v);

        $("autoLight").onclick=()=>{
            snapshot();

            const data=imageCtx.getImageData(
                0,0,imageCanvas.width,imageCanvas.height
            ).data;

            let total=0;
            const step=Math.max(4,Math.floor(data.length/40000));

            for(let i=0;i<data.length;i+=step*4){
                total+=(data[i]+data[i+1]+data[i+2])/3;
            }

            const avg=total/(data.length/(step*4));
            state.light.exposure=clamp((128-avg)/1.8,-50,50);
            renderPanel("light");
            render();
        };
    }

    if(tool==="color"){
        c.innerHTML=panel(
            "Color",
            "Control white balance, vibrance, saturation, HSL and color grading.",
            `<div class="control-group">
                <h3 class="group-title">Basic Color</h3>
                ${buildControl("Temperature","temperature",-100,100,1,0)}
                ${buildControl("Tint","tint",-100,100,1,0)}
                ${buildControl("Vibrance","vibrance",-100,100,1,0)}
                ${buildControl("Saturation","saturation",-100,100,1,0)}
            </div>

            <div class="control-group">
                <h3 class="group-title">Color Mixer</h3>
                ${buildControl("Target Hue","mixerHue",-180,180,1,0)}
                ${buildControl("Color Range","mixerRange",1,90,1,30)}
                ${buildControl("Mixer Saturation","mixerSat",-100,100,1,0)}
                ${buildControl("Mixer Lightness","mixerLight",-100,100,1,0)}
            </div>

            <div class="control-group">
                <h3 class="group-title">Color Grading</h3>
                ${buildControl("Shadow Hue","shadowHue",0,360,1,0)}
                ${buildControl("Shadow Saturation","shadowSat",0,100,1,0)}
                ${buildControl("Midtone Hue","midHue",0,360,1,0)}
                ${buildControl("Midtone Saturation","midSat",0,100,1,0)}
                ${buildControl("Highlight Hue","highlightHue",0,360,1,0)}
                ${buildControl("Highlight Saturation","highlightSat",0,100,1,0)}
                ${buildControl("Blending","gradeBlend",0,100,1,50)}
                ${buildControl("Balance","gradeBalance",-100,100,1,0)}
            </div>`
        );

        bindRange("temperature",v=>state.color.temperature=v);
        bindRange("tint",v=>state.color.tint=v);
        bindRange("vibrance",v=>state.color.vibrance=v);
        bindRange("saturation",v=>state.color.saturation=v);
        bindRange("mixerHue",v=>state.color.hue=v);
        bindRange("mixerRange",v=>state.color.hueRange=v);
        bindRange("mixerSat",v=>state.color.mixerSaturation=v);
        bindRange("mixerLight",v=>state.color.mixerLightness=v);
        bindRange("shadowHue",v=>state.color.shadowHue=v);
        bindRange("shadowSat",v=>state.color.shadowSat=v);
        bindRange("midHue",v=>state.color.midHue=v);
        bindRange("midSat",v=>state.color.midSat=v);
        bindRange("highlightHue",v=>state.color.highlightHue=v);
        bindRange("highlightSat",v=>state.color.highlightSat=v);
        bindRange("gradeBlend",v=>state.color.gradeBlend=v);
        bindRange("gradeBalance",v=>state.color.gradeBalance=v);
    }

    if(tool==="effects"){
        c.innerHTML=panel(
            "Effects",
            "Add local-looking texture, clarity, haze control, vignette and grain.",
            `<div class="control-group">
                <h3 class="group-title">Effects</h3>
                ${buildControl("Texture","texture",-100,100,1,0)}
                ${buildControl("Clarity","clarity",-100,100,1,0)}
                ${buildControl("Dehaze","dehaze",-100,100,1,0)}
                ${buildControl("Vignette","vignette",-100,100,1,0)}
                ${buildControl("Midpoint","midpoint",0,100,1,50)}
                ${buildControl("Feather","feather",0,100,1,50)}
                ${buildControl("Roundness","roundness",-100,100,1,0)}
            </div>

            <div class="control-group">
                <h3 class="group-title">Grain</h3>
                ${buildControl("Amount","grain",0,100,1,0)}
                ${buildControl("Size","grainSize",1,100,1,25)}
                ${buildControl("Roughness","grainRough",0,100,1,50)}
            </div>`
        );

        bindRange("texture",v=>state.effects.texture=v);
        bindRange("clarity",v=>state.effects.clarity=v);
        bindRange("dehaze",v=>state.effects.dehaze=v);
        bindRange("vignette",v=>state.effects.vignette=v);
        bindRange("midpoint",v=>state.effects.midpoint=v);
        bindRange("feather",v=>state.effects.feather=v);
        bindRange("roundness",v=>state.effects.roundness=v);
        bindRange("grain",v=>state.effects.grain=v);
        bindRange("grainSize",v=>state.effects.grainSize=v);
        bindRange("grainRough",v=>state.effects.grainRough=v);
    }

    if(tool==="detail"){
        c.innerHTML=panel(
            "Detail",
            "Sharpen fine details and reduce luminance or color noise.",
            `<div class="control-group">
                <h3 class="group-title">Sharpening</h3>
                ${buildControl("Amount","sharpening",0,100,1,0)}
                ${buildControl("Radius","radius",0.5,3,.1,1)}
                ${buildControl("Detail","detail",0,100,1,25)}
                ${buildControl("Masking","masking",0,100,1,0)}
            </div>

            <div class="control-group">
                <h3 class="group-title">Noise Reduction</h3>
                ${buildControl("Luminance","noiseReduction",0,100,1,0)}
                ${buildControl("Detail","noiseDetail",0,100,1,50)}
                ${buildControl("Contrast","noiseContrast",-100,100,1,0)}
                ${buildControl("Color","colorNoise",0,100,1,0)}
                ${buildControl("Color Detail","colorDetail",0,100,1,50)}
                ${buildControl("Smoothness","smoothness",0,100,1,50)}
            </div>`
        );

        bindRange("sharpening",v=>state.detail.sharpening=v);
        bindRange("radius",v=>state.detail.radius=v);
        bindRange("detail",v=>state.detail.detail=v);
        bindRange("masking",v=>state.detail.masking=v);
        bindRange("noiseReduction",v=>state.detail.noiseReduction=v);
        bindRange("noiseDetail",v=>state.detail.noiseDetail=v);
        bindRange("noiseContrast",v=>state.detail.noiseContrast=v);
        bindRange("colorNoise",v=>state.detail.colorNoise=v);
        bindRange("colorDetail",v=>state.detail.colorDetail=v);
        bindRange("smoothness",v=>state.detail.smoothness=v);
    }

    if(tool==="crop"){
        c.innerHTML=panel(
            "Crop & Transform",
            "Crop, straighten, rotate and flip the image.",
            `<div class="crop-info">
                Drag inside the image to move the crop.
                Drag a corner handle to resize it.
            </div>

            <div class="control-group">
                <h3 class="group-title">Aspect Ratio</h3>
                <select id="cropRatio">
                    <option>Free</option>
                    <option>Original</option>
                    <option>1:1</option>
                    <option>4:5</option>
                    <option>3:4</option>
                    <option>4:3</option>
                    <option>16:9</option>
                    <option>9:16</option>
                    <option>3:2</option>
                    <option>2:3</option>
                </select>
            </div>

            ${buildControl("Straighten","straighten",-15,15,.1,0)}

            <div class="button-grid">
                <button id="rotateLeft" class="action-btn">Rotate Left</button>
                <button id="rotateRight" class="action-btn">Rotate Right</button>
                <button id="flipH" class="action-btn">Flip Horizontal</button>
                <button id="flipV" class="action-btn">Flip Vertical</button>
                <button id="resetCrop" class="action-btn">Reset Crop</button>
                <button id="applyCrop" class="action-btn primary">Apply Crop</button>
            </div>`
        );

        $("cropRatio").value=state.crop.ratio;

        $("cropRatio").onchange=()=>{
            snapshot();
            state.crop.ratio=$("cropRatio").value;
            initializeCrop();
            render();
        };

        bindRange("straighten",v=>{
            state.crop.straighten=v;
        });

        $("rotateLeft").onclick=()=>{
            snapshot();
            rotateImage(-90);
        };

        $("rotateRight").onclick=()=>{
            snapshot();
            rotateImage(90);
        };

        $("flipH").onclick=()=>{
            snapshot();
            flipImage(true,false);
        };

        $("flipV").onclick=()=>{
            snapshot();
            flipImage(false,true);
        };

        $("resetCrop").onclick=()=>{
            snapshot();
            initializeCrop();
            state.crop.straighten=0;
            render();
        };

        $("applyCrop").onclick=()=>{
            snapshot();
            applyCrop();
        };

        initializeCrop();
    }

    if(tool==="text"){
        c.innerHTML=panel(
            "Text",
            "Add editable text, drag it anywhere on the photo and style it.",
            `<div class="control-group">
                <h3 class="group-title">Content</h3>
                <textarea id="textValue" placeholder="Enter text"></textarea>
                <button id="addText" class="action-btn primary" style="margin-top:8px">Add Text</button>
            </div>

            <div class="control-group">
                <h3 class="group-title">Typography</h3>
                <select id="textFont">
                    <option>Arial</option>
                    <option>Helvetica</option>
                    <option>Georgia</option>
                    <option>Times New Roman</option>
                    <option>Verdana</option>
                    <option>Trebuchet MS</option>
                    <option>Courier New</option>
                    <option>Impact</option>
                </select>

                ${buildControl("Font Size","textSize",8,220,1,48)}
                ${buildControl("Opacity","textOpacity",0,100,1,100)}
                ${buildControl("Stroke Width","textStroke",0,20,1,0)}

                <div class="check-row">
                    <input id="textBold" type="checkbox">
                    <label for="textBold">Bold</label>
                </div>

                <div class="check-row">
                    <input id="textItalic" type="checkbox">
                    <label for="textItalic">Italic</label>
                </div>

                <select id="textAlign">
                    <option value="left">Left</option>
                    <option value="center" selected>Center</option>
                    <option value="right">Right</option>
                </select>
            </div>

            <div class="control-group">
                <h3 class="group-title">Colors</h3>
                <div class="color-row">
                    <span>Text Color</span>
                    <input id="textColor" type="color" value="#ffffff">
                </div>
                <div class="color-row">
                    <span>Stroke Color</span>
                    <input id="textStrokeColor" type="color" value="#000000">
                </div>
            </div>

            <button id="deleteText" class="action-btn danger">Delete Selected Text</button>
            <button id="clearText" class="action-btn danger" style="margin-top:7px">Clear All Text</button>`
        );

        bindTextControls();
    }

    if(tool==="draw"){
        c.innerHTML=panel(
            "Draw",
            "Draw freehand strokes directly over the photo.",
            `<div class="control-group">
                ${buildControl("Brush Size","drawSize",1,120,1,12)}
                ${buildControl("Opacity","drawOpacity",1,100,1,100)}
                <div class="color-row">
                    <span>Brush Color</span>
                    <input id="drawColor" type="color" value="#ffffff">
                </div>
            </div>

            <div class="button-grid">
                <button id="clearDraw" class="action-btn danger">Clear Drawing</button>
                <button id="undoDraw" class="action-btn">Remove Last</button>
            </div>`
        );

        bindRange("drawSize",v=>state.draw.size=v);
        bindRange("drawOpacity",v=>state.draw.opacity=v);

        $("drawColor").oninput=e=>{
            state.draw.color=e.target.value;
        };

        $("clearDraw").onclick=()=>{
            if(!state.draw.strokes.length)return;
            snapshot();
            state.draw.strokes=[];
            render();
        };

        $("undoDraw").onclick=()=>{
            if(!state.draw.strokes.length)return;
            snapshot();
            state.draw.strokes.pop();
            render();
        };
    }

    if(tool==="selective"){
        c.innerHTML=panel(
            "Color Select",
            "Click a color directly in the photo, then adjust that color range.",
            `<div class="picked-color" id="pickedColor">Click a color on the image</div>

            ${buildControl("Color Range","selectRange",1,100,1,30)}
            ${buildControl("Hue","selectHue",-180,180,1,0)}
            ${buildControl("Saturation","selectSat",-100,100,1,0)}
            ${buildControl("Lightness","selectLight",-100,100,1,0)}

            <button id="clearColorSelect" class="action-btn">Clear Selection</button>`
        );

        bindRange("selectRange",v=>state.selective.range=v);
        bindRange("selectHue",v=>state.selective.hue=v);
        bindRange("selectSat",v=>state.selective.saturation=v);
        bindRange("selectLight",v=>state.selective.lightness=v);

        $("clearColorSelect").onclick=()=>{
            state.selective.picked=null;
            $("pickedColor").textContent="Click a color on the image";
            $("stage").classList.remove("color-picking");
            render();
        };

        $("stage").classList.add("color-picking");
    }else{
        $("stage").classList.remove("color-picking");
    }

    if(tool==="presets"){
        c.innerHTML=panel(
            "Presets",
            "Apply quick professional looks and control their intensity.",
            `<div class="control-group">
                <select id="presetName">
                    <option>None</option>
                    <option>Clean</option>
                    <option>Warm</option>
                    <option>Cool</option>
                    <option>Cinematic</option>
                    <option>Matte</option>
                    <option>Vivid</option>
                    <option>Portrait</option>
                    <option>B&W</option>
                </select>
                ${buildControl("Preset Amount","presetAmount",0,100,1,100)}
                <button id="applyPreset" class="action-btn primary">Apply Preset</button>
                <button id="resetAdjustments" class="action-btn" style="margin-top:7px">Reset Adjustments</button>
            </div>`
        );

        $("presetName").value=state.preset.name;

        bindRange("presetAmount",v=>state.preset.amount=v);

        $("presetName").onchange=e=>{
            state.preset.name=e.target.value;
        };

        $("applyPreset").onclick=()=>{
            snapshot();
            applyPreset(state.preset.name,state.preset.amount/100);
        };

        $("resetAdjustments").onclick=()=>{
            snapshot();
            resetAdjustments();
            render();
        };
    }

    if(tool==="profiles"){
        c.innerHTML=panel(
            "Profiles",
            "Choose a base rendering style for the image.",
            `<select id="profileSelect">
                <option>Basic</option>
                <option>Modern</option>
                <option>Vivid</option>
                <option>Portrait</option>
                <option>Cinematic</option>
                <option>Vintage</option>
                <option>Matte</option>
                <option>B&W</option>
                <option>Cool</option>
                <option>Warm</option>
            </select>

            <button id="applyProfile" class="action-btn primary" style="margin-top:10px">
                Apply Profile
            </button>`
        );

        $("profileSelect").value=state.profile;

        $("profileSelect").onchange=e=>{
            state.profile=e.target.value;
        };

        $("applyProfile").onclick=()=>{
            snapshot();
            applyProfile(state.profile);
        };
    }

    if(tool==="mask"){
        c.innerHTML=panel(
            "Mask",
            "Create browser-side radial or linear local adjustment masks.",
            `<select id="maskType">
                <option>None</option>
                <option>Radial</option>
                <option>Linear</option>
            </select>

            ${buildControl("Mask Amount","maskAmount",0,100,1,50)}
            ${buildControl("Feather","maskFeather",0,100,1,50)}
            ${buildControl("Exposure","maskExposure",-100,100,1,0)}
            ${buildControl("Contrast","maskContrast",-100,100,1,0)}
            ${buildControl("Saturation","maskSaturation",-100,100,1,0)}
            ${buildControl("Hue","maskHue",-180,180,1,0)}
            ${buildControl("Texture","maskTexture",-100,100,1,0)}
            ${buildControl("Clarity","maskClarity",-100,100,1,0)}
            ${buildControl("Dehaze","maskDehaze",-100,100,1,0)}
            
            <div class="control-group">
                <h3 class="group-title">Mask Position</h3>
                ${buildControl("Center X","maskX",0,100,1,50)}
                ${buildControl("Center Y","maskY",0,100,1,50)}
                ${buildControl("Width","maskWidth",5,100,1,70)}
                ${buildControl("Height","maskHeight",5,100,1,70)}
            </div>`
        );

        $("maskType").value=state.mask.type;

        $("maskType").onchange=e=>{
            state.mask.type=e.target.value;
            render();
        };

        bindRange("maskAmount",v=>state.mask.amount=v);
        bindRange("maskFeather",v=>state.mask.feather=v);
        bindRange("maskExposure",v=>state.mask.exposure=v);
        bindRange("maskContrast",v=>state.mask.contrast=v);
        bindRange("maskSaturation",v=>state.mask.saturation=v);
        bindRange("maskHue",v=>state.mask.hue=v);
        bindRange("maskTexture",v=>state.mask.texture=v);
        bindRange("maskClarity",v=>state.mask.clarity=v);
        bindRange("maskDehaze",v=>state.mask.dehaze=v);
        bindRange("maskX",v=>state.mask.x=v);
        bindRange("maskY",v=>state.mask.y=v);
        bindRange("maskWidth",v=>state.mask.width=v);
        bindRange("maskHeight",v=>state.mask.height=v);
    }

    if(tool==="retouch"){
        c.innerHTML=panel(
            "Retouch",
            "Paint over small areas for browser-side local healing/softening.",
            `${buildControl("Brush Size","retouchSize",2,160,1,30)}
            ${buildControl("Feather","retouchFeather",0,100,1,70)}
            ${buildControl("Opacity","retouchOpacity",1,100,1,100)}

            <button id="clearRetouch" class="action-btn danger">Clear Retouch</button>`
        );

        bindRange("retouchSize",v=>state.retouch.size=v);
        bindRange("retouchFeather",v=>state.retouch.feather=v);
        bindRange("retouchOpacity",v=>state.retouch.opacity=v);

        $("clearRetouch").onclick=()=>{
            if(!state.retouch.strokes.length)return;
            snapshot();
            state.retouch.strokes=[];
            render();
        };
    }

    if(tool==="blur"){
        c.innerHTML=panel(
            "Lens Blur",
            "Create a depth-style focus effect using a soft radial focus area.",
            `${buildControl("Blur Amount","blurAmount",0,100,1,0)}
            ${buildControl("Focus X","focusX",0,100,1,50)}
            ${buildControl("Focus Y","focusY",0,100,1,50)}
            ${buildControl("Focus Size","focusSize",5,100,1,40)}
            ${buildControl("Focus Feather","focusFeather",0,100,1,50)}`
        );

        bindRange("blurAmount",v=>state.blur.amount=v);
        bindRange("focusX",v=>state.blur.focusX=v);
        bindRange("focusY",v=>state.blur.focusY=v);
        bindRange("focusSize",v=>state.blur.focusSize=v);
        bindRange("focusFeather",v=>state.blur.feather=v);
    }

    if(tool==="optics"){
        c.innerHTML=panel(
            "Optics",
            "Apply browser-side lens and edge corrections.",
            `${buildControl("Vignette","lensVignette",-100,100,1,0)}
            ${buildControl("Defringe","defringe",0,100,1,0)}
            ${buildControl("Distortion","distortion",-100,100,1,0)}`
        );

        bindRange("lensVignette",v=>state.optics.vignette=v);
        bindRange("defringe",v=>state.optics.defringe=v);
        bindRange("distortion",v=>state.optics.distortion=v);
    }

    if(tool==="layers"){
        let html=panel(
            "Layers",
            "Manage text and drawing overlays.",
            `<div class="layer-list">`
        );

        state.text.layers.forEach((l,i)=>{
            html+=`
            <button class="layer-item" data-text-layer="${i}">
                Text: ${escapeHtml(l.text.slice(0,30))}
            </button>`;
        });

        state.draw.strokes.forEach((s,i)=>{
            html+=`
            <button class="layer-item" data-draw-layer="${i}">
                Brush Stroke ${i+1}
            </button>`;
        });

        html+=`
            </div>
            <button id="clearLayers" class="action-btn danger">Clear All Layers</button>
        `;

        c.innerHTML=html;

        document.querySelectorAll("[data-text-layer]").forEach(btn=>{
            btn.onclick=()=>{
                state.text.selected=Number(btn.dataset.textLayer);
                state.tool="text";
                renderPanel("text");
                render();
            };
        });

        $("clearLayers").onclick=()=>{
            if(!state.text.layers.length&&!state.draw.strokes.length)return;

            snapshot();
            state.text.layers=[];
            state.draw.strokes=[];
            render();
            renderPanel("layers");
        };
    }

    if(tool==="export"){
        c.innerHTML=panel(
            "Export",
            "Save your edited image in a standard browser-supported format.",
            `<div class="control-group">
                <h3 class="group-title">Format</h3>
                <select id="exportFormat">
                    <option value="image/jpeg">JPG</option>
                    <option value="image/png">PNG</option>
                    <option value="image/webp">WebP</option>
                </select>
            </div>

            ${buildControl("Quality","exportQuality",10,100,1,92)}

            <div class="control-group">
                <h3 class="group-title">Maximum Edge</h3>
                <select id="exportSize">
                    <option value="original">Original</option>
                    <option value="4096">4096 px</option>
                    <option value="3000">3000 px</option>
                    <option value="2048">2048 px</option>
                    <option value="1600">1600 px</option>
                    <option value="1080">1080 px</option>
                </select>
            </div>

            <label class="check-row">
                <input id="includeOverlays" type="checkbox" checked>
                Include text and drawing layers
            </label>

            <button id="downloadImage" class="action-btn primary">Download Image</button>`
        );

        bindRange("exportQuality",v=>{}, "%");

        $("downloadImage").onclick=exportImage;
    }
}

function escapeHtml(str){
    return String(str)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}

function switchTool(tool){
    state.tool=tool;

    document.querySelectorAll("#toolTabs button").forEach(btn=>{
        btn.classList.toggle("active",btn.dataset.tool===tool);
    });

    renderPanel(tool);
    render();
}

document.querySelectorAll("#toolTabs button").forEach(btn=>{
    btn.onclick=()=>switchTool(btn.dataset.tool);
});

function resetAdjustments(){
    state.light={
        exposure:0,
        contrast:0,
        highlights:0,
        shadows:0,
        whites:0,
        blacks:0
    };

    state.color={
        temperature:0,
        tint:0,
        vibrance:0,
        saturation:0,
        hue:0,
        hueRange:30,
        mixerSaturation:0,
        mixerLightness:0,
        shadowHue:0,
        shadowSat:0,
        midHue:0,
        midSat:0,
        highlightHue:0,
        highlightSat:0,
        gradeBlend:50,
        gradeBalance:0
    };

    state.effects={
        texture:0,
        clarity:0,
        dehaze:0,
        vignette:0,
        midpoint:50,
        feather:50,
        roundness:0,
        grain:0,
        grainSize:25,
        grainRoughness:50
    };

    state.detail={
        sharpening:0,
        radius:1,
        detail:25,
        masking:0,
        noiseReduction:0,
        noiseDetail:50,
        noiseContrast:0,
        colorNoise:0,
        colorDetail:50,
        smoothness:50
    };
}

function applyPreset(name,amount){
    resetAdjustments();

    const a=amount;

    const presets={
        Clean:{
            contrast:8,
            saturation:3,
            clarity:4
        },
        Warm:{
            temperature:25,
            saturation:5,
            highlights:5,
            vignette:4
        },
        Cool:{
            temperature:-25,
            saturation:3,
            shadows:-5
        },
        Cinematic:{
            contrast:15,
            saturation:-8,
            dehaze:10,
            vignette:12,
            highlights:-10,
            shadows:8
        },
        Matte:{
            contrast:-12,
            blacks:20,
            saturation:-5
        },
        Vivid:{
            contrast:10,
            saturation:20,
            vibrance:25,
            clarity:7
        },
        Portrait:{
            highlights:-10,
            shadows:12,
            saturation:4,
            clarity:-5
        },
        "B&W":{
            saturation:-100,
            contrast:10
        }
    };

    const p=presets[name];

    if(p){
        if(p.contrast)state.light.contrast=p.contrast*a;
        if(p.highlights)state.light.highlights=p.highlights*a;
        if(p.shadows)state.light.shadows=p.shadows*a;
        if(p.blacks)state.light.blacks=p.blacks*a;
        if(p.temperature)state.color.temperature=p.temperature*a;
        if(p.saturation)state.color.saturation=p.saturation*a;
        if(p.vibrance)state.color.vibrance=p.vibrance*a;
        if(p.clarity)state.effects.clarity=p.clarity*a;
        if(p.dehaze)state.effects.dehaze=p.dehaze*a;
        if(p.vignette)state.effects.vignette=p.vignette*a;
    }

    state.preset.name=name;
    render();
}

function applyProfile(name){
    const p=profiles[name]||{};

    resetAdjustments();

    if(p.contrast)state.light.contrast=p.contrast;
    if(p.saturation)state.color.saturation=p.saturation;
    if(p.vibrance)state.color.vibrance=p.vibrance;
    if(p.clarity)state.effects.clarity=p.clarity;
    if(p.dehaze)state.effects.dehaze=p.dehaze;
    if(p.temperature)state.color.temperature=p.temperature;
    if(p.highlights)state.light.highlights=p.highlights;
    if(p.shadows)state.light.shadows=p.shadows;
    if(p.blacks)state.light.blacks=p.blacks;
    if(p.grain)state.effects.grain=p.grain;
    if(p.vignette)state.effects.vignette=p.vignette;

    if(name==="B&W"){
        state.color.saturation=-100;
    }

    render();
}

function bindTextControls(){
    const layer=state.text.selected>=0?
        state.text.layers[state.text.selected]:null;

    $("textValue").value=layer?layer.text:"";
    $("textFont").value=layer?layer.font:"Arial";
    $("textSize").value=layer?layer.size:48;
    $("textOpacity").value=layer?layer.opacity:100;
    $("textStroke").value=layer?layer.strokeWidth:0;
    $("textBold").checked=layer?layer.bold:false;
    $("textItalic").checked=layer?layer.italic:false;
    $("textAlign").value=layer?layer.align:"center";
    $("textColor").value=layer?layer.color:"#ffffff";
    $("textStrokeColor").value=layer?layer.stroke:"#000000";

    bindRange("textSize",v=>{
        if(layer)layer.size=v;
        state.text.size=v;
    });

    bindRange("textOpacity",v=>{
        if(layer)layer.opacity=v;
        state.text.opacity=v;
    });

    bindRange("textStroke",v=>{
        if(layer)layer.strokeWidth=v;
        state.text.strokeWidth=v;
    });

    $("textFont").onchange=e=>{
        if(layer)layer.font=e.target.value;
        state.text.font=e.target.value;
        render();
    };

    $("textBold").onchange=e=>{
        if(layer)layer.bold=e.target.checked;
        state.text.bold=e.target.checked;
        render();
    };

    $("textItalic").onchange=e=>{
        if(layer)layer.italic=e.target.checked;
        state.text.italic=e.target.checked;
        render();
    };

    $("textAlign").onchange=e=>{
        if(layer)layer.align=e.target.value;
        state.text.align=e.target.value;
        render();
    };

    $("textColor").oninput=e=>{
        if(layer)layer.color=e.target.value;
        state.text.color=e.target.value;
        render();
    };

    $("textStrokeColor").oninput=e=>{
        if(layer)layer.stroke=e.target.value;
        state.text.stroke=e.target.value;
        render();
    };

    $("textValue").oninput=e=>{
        if(layer){
            layer.text=e.target.value;
            render();
        }
    };

    $("addText").onclick=()=>{
        const text=$("textValue").value.trim();

        if(!text)return;

        snapshot();

        const layer={
            id:Date.now(),
            text,
            x:imageCanvas.width/2,
            y:imageCanvas.height/2,
            font:state.text.font,
            size:state.text.size,
            opacity:state.text.opacity,
            bold:state.text.bold,
            italic:state.text.italic,
            align:state.text.align,
            color:state.text.color,
            stroke:state.text.stroke,
            strokeWidth:state.text.strokeWidth
        };

        state.text.layers.push(layer);
        state.text.selected=state.text.layers.length-1;

        renderPanel("text");
        render();
    };

    $("deleteText").onclick=()=>{
        if(state.text.selected<0)return;

        snapshot();
        state.text.layers.splice(state.text.selected,1);
        state.text.selected=-1;
        renderPanel("text");
        render();
    };

    $("clearText").onclick=()=>{
        if(!state.text.layers.length)return;

        snapshot();
        state.text.layers=[];
        state.text.selected=-1;
        render();
    };
}

function drawTextLayer(ctx,l){
    ctx.save();

    ctx.globalAlpha=clamp01(l.opacity/100);

    const style=
        `${l.italic?"italic ":""}${l.bold?"bold ":""}${l.size}px ${l.font}`;

    ctx.font=style;
    ctx.textAlign=l.align;
    ctx.textBaseline="middle";

    if(l.strokeWidth>0){
        ctx.lineWidth=l.strokeWidth*2;
        ctx.strokeStyle=l.stroke;
        ctx.strokeText(l.text,l.x,l.y);
    }

    ctx.fillStyle=l.color;
    ctx.fillText(l.text,l.x,l.y);

    ctx.restore();
}

function renderOverlays(){
    overlayCtx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);

    if(!state.sourceCanvas)return;

    state.text.layers.forEach((l,i)=>{
        drawTextLayer(overlayCtx,l);

        if(state.tool==="text"&&i===state.text.selected){
            overlayCtx.save();
            overlayCtx.strokeStyle="rgba(255,255,255,.65)";
            overlayCtx.setLineDash([7,5]);

            const m=overlayCtx.measureText(l.text);
            let x=l.x;

            if(l.align==="center")x-=m.width/2;
            if(l.align==="right")x-=m.width;

            overlayCtx.strokeRect(
                x-8,
                l.y-l.size/2-8,
                m.width+16,
                l.size+16
            );

            overlayCtx.restore();
        }
    });

    state.draw.strokes.forEach(stroke=>{
        if(!stroke.points.length)return;

        overlayCtx.save();

        overlayCtx.globalAlpha=stroke.opacity/100;
        overlayCtx.strokeStyle=stroke.color;
        overlayCtx.lineWidth=stroke.size;
        overlayCtx.lineCap="round";
        overlayCtx.lineJoin="round";

        overlayCtx.beginPath();

        stroke.points.forEach((p,i)=>{
            if(i===0)overlayCtx.moveTo(p.x,p.y);
            else overlayCtx.lineTo(p.x,p.y);
        });

        overlayCtx.stroke();
        overlayCtx.restore();
    });

    if(state.tool==="crop"&&state.crop.active){
        drawCropOverlay();
    }
}

function handleTextPointerDown(e){
    const p=canvasPoint(e);

    for(let i=state.text.layers.length-1;i>=0;i--){
        const l=state.text.layers[i];

        overlayCtx.font=
            `${l.italic?"italic ":""}${l.bold?"bold ":""}${l.size}px ${l.font}`;

        const width=overlayCtx.measureText(l.text).width;

        let left=l.x-width/2;

        if(l.align==="left")left=l.x;
        if(l.align==="right")left=l.x-width;

        if(
            p.x>=left-15 &&
            p.x<=left+width+15 &&
            p.y>=l.y-l.size &&
            p.y<=l.y+l.size
        ){
            snapshot();
            state.text.selected=i;
            state.text.dragging=true;
            state.text.dragOffsetX=p.x-l.x;
            state.text.dragOffsetY=p.y-l.y;
            renderPanel("text");
            render();
            return;
        }
    }
}

function moveTextPointer(e){
    if(!state.text.dragging)return;

    const l=state.text.layers[state.text.selected];
    if(!l)return;

    const p=canvasPoint(e);

    l.x=p.x-state.text.dragOffsetX;
    l.y=p.y-state.text.dragOffsetY;

    render();
}

function finishTextDrag(){
    state.text.dragging=false;
}

$("stage").addEventListener("pointerup",finishTextDrag);

function startDraw(e){
    const p=canvasPoint(e);

    snapshot();

    state.draw.drawing=true;

    state.draw.current={
        size:state.draw.size,
        opacity:state.draw.opacity,
        color:state.draw.color,
        points:[p]
    };

    state.draw.strokes.push(state.draw.current);
    render();
}

function continueDraw(e){
    if(!state.draw.drawing)return;

    const p=canvasPoint(e);
    state.draw.current.points.push(p);

    render();
}

function finishDraw(){
    state.draw.drawing=false;
    state.draw.current=null;
}

function startRetouch(e){
    const p=canvasPoint(e);

    snapshot();

    state.retouch.drawing=true;

    state.retouch.strokes.push({
        size:state.retouch.size,
        feather:state.retouch.feather,
        opacity:state.retouch.opacity,
        points:[p]
    });

    render();
}

function continueRetouch(e){
    if(!state.retouch.drawing)return;

    const stroke=
        state.retouch.strokes[state.retouch.strokes.length-1];

    stroke.points.push(canvasPoint(e));

    render();
}

function finishRetouch(){
    state.retouch.drawing=false;
}

function pickColor(e){
    if(!state.sourceCanvas)return;

    const p=canvasPoint(e);

    const x=Math.round(clamp(p.x,0,imageCanvas.width-1));
    const y=Math.round(clamp(p.y,0,imageCanvas.height-1));

    const d=imageCtx.getImageData(x,y,1,1).data;

    state.selective.picked={
        r:d[0],
        g:d[1],
        b:d[2]
    };

    const hex="#"+
        [d[0],d[1],d[2]]
        .map(v=>v.toString(16).padStart(2,"0"))
        .join("");

    const box=$("pickedColor");

    if(box){
        box.textContent=`Selected ${hex}`;
        box.style.background=hex;
        box.style.color=(d[0]+d[1]+d[2])>400?"#111":"#fff";
    }

    render();
}

function initializeCrop(){
    if(!imageCanvas.width)return;

    state.crop.x=0.08;
    state.crop.y=0.08;
    state.crop.w=.84;
    state.crop.h=.84;
    state.crop.active=true;

    applyCropRatio();
}

function applyCropRatio(){
    if(state.crop.ratio==="Free"||state.crop.ratio==="Original"){
        return;
    }

    const parts=state.crop.ratio.split(":");
    const ratio=Number(parts[0])/Number(parts[1]);

    let w=state.crop.w;
    let h=w/imageCanvas.width*imageCanvas.height/ratio;

    if(h>state.crop.h){
        h=state.crop.h;
        w=h*ratio*imageCanvas.width/imageCanvas.height;
    }

    state.crop.w=w;
    state.crop.h=h;

    state.crop.x=(1-w)/2;
    state.crop.y=(1-h)/2;
}

function drawCropOverlay(){
    const x=state.crop.x*overlayCanvas.width;
    const y=state.crop.y*overlayCanvas.height;
    const w=state.crop.w*overlayCanvas.width;
    const h=state.crop.h*overlayCanvas.height;

    overlayCtx.save();

    overlayCtx.fillStyle="rgba(0,0,0,.55)";
    overlayCtx.fillRect(
        0,
        0,
        overlayCanvas.width,
        overlayCanvas.height
    );

    overlayCtx.clearRect(x,y,w,h);

    overlayCtx.strokeStyle="#fff";
    overlayCtx.lineWidth=Math.max(2,overlayCanvas.width/700);
    overlayCtx.setLineDash([]);

    overlayCtx.strokeRect(x,y,w,h);

    overlayCtx.strokeStyle="rgba(255,255,255,.45)";
    overlayCtx.lineWidth=1;

    for(let i=1;i<3;i++){
        overlayCtx.beginPath();
        overlayCtx.moveTo(x+w*i/3,y);
        overlayCtx.lineTo(x+w*i/3,y+h);
        overlayCtx.stroke();

        overlayCtx.beginPath();
        overlayCtx.moveTo(x,y+h*i/3);
        overlayCtx.lineTo(x+w,y+h*i/3);
        overlayCtx.stroke();
    }

    const hs=12;

    const handles=[
        [x,y],[x+w,y],[x,y+h],[x+w,y+h]
    ];

    overlayCtx.fillStyle="#fff";

    handles.forEach(([hx,hy])=>{
        overlayCtx.fillRect(
            hx-hs/2,
            hy-hs/2,
            hs,
            hs
        );
    });

    overlayCtx.restore();
}

function startCropPointer(e){
    if(!state.crop.active)initializeCrop();

    const p=canvasPoint(e);

    const x=p.x/imageCanvas.width;
    const y=p.y/imageCanvas.height;

    const c=state.crop;

    const px=c.x;
    const py=c.y;
    const pw=c.w;
    const ph=c.h;

    const near=0.025;

    c.startX=x;
    c.startY=y;
    c.startCrop={...c};

    if(Math.abs(x-px)<near&&Math.abs(y-py)<near)c.handle="tl";
    else if(Math.abs(x-(px+pw))<near&&Math.abs(y-py)<near)c.handle="tr";
    else if(Math.abs(x-px)<near&&Math.abs(y-(py+ph))<near)c.handle="bl";
    else if(Math.abs(x-(px+pw))<near&&Math.abs(y-(py+ph))<near)c.handle="br";
    else if(x>=px&&x<=px+pw&&y>=py&&y<=py+ph)c.handle="move";
    else c.handle="";

    if(c.handle){
        c.dragging=true;
        c.startCrop={...c};
    }
}

function moveCropPointer(e){
    if(!state.crop.dragging)return;

    const p=canvasPoint(e);

    const x=p.x/imageCanvas.width;
    const y=p.y/imageCanvas.height;

    const c=state.crop;
    const s=c.startCrop;

    const dx=x-c.startX;
    const dy=y-c.startY;

    if(c.handle==="move"){
        c.x=clamp01(s.x+dx);
        c.y=clamp01(s.y+dy);

        c.x=Math.min(c.x,1-c.w);
        c.y=Math.min(c.y,1-c.h);
    }else{
        let nx=s.x;
        let ny=s.y;
        let nw=s.w;
        let nh=s.h;

        if(c.handle.includes("l")){
            nx=s.x+dx;
            nw=s.w-dx;
        }

        if(c.handle.includes("r")){
            nw=s.w+dx;
        }

        if(c.handle.includes("t")){
            ny=s.y+dy;
            nh=s.h-dy;
        }

        if(c.handle.includes("b")){
            nh=s.h+dy;
        }

        nw=Math.max(.05,nw);
        nh=Math.max(.05,nh);

        nx=clamp(nx,0,1-nw);
        ny=clamp(ny,0,1-nh);

        c.x=nx;
        c.y=ny;
        c.w=nw;
        c.h=nh;
    }

    render();
}

function finishCropPointer(){
    state.crop.dragging=false;
    state.crop.handle="";
}

function rotateImage(deg){
    const src=state.sourceCanvas;

    const c=document.createElement("canvas");
    const ctx=c.getContext("2d");

    const rad=deg*Math.PI/180;

    if(Math.abs(deg)===90){
        c.width=src.height;
        c.height=src.width;
    }else{
        c.width=src.width;
        c.height=src.height;
    }

    ctx.translate(c.width/2,c.height/2);
    ctx.rotate(rad);
    ctx.drawImage(src,-src.width/2,-src.height/2);

    state.sourceCanvas=c;

    imageCanvas.width=c.width;
    imageCanvas.height=c.height;
    overlayCanvas.width=c.width;
    overlayCanvas.height=c.height;

    state.crop.active=false;

    fitImage();
    render();
}

function flipImage(horizontal,vertical){
    const src=state.sourceCanvas;

    const c=document.createElement("canvas");
    c.width=src.width;
    c.height=src.height;

    const ctx=c.getContext("2d");

    ctx.translate(
        horizontal?c.width:0,
        vertical?c.height:0
    );

    ctx.scale(
        horizontal?-1:1,
        vertical?-1:1
    );

    ctx.drawImage(src,0,0);

    state.sourceCanvas=c;

    imageCanvas.width=c.width;
    imageCanvas.height=c.height;
    overlayCanvas.width=c.width;
    overlayCanvas.height=c.height;

    fitImage();
    render();
}

function applyCrop(){
    if(!state.crop.active)return;

    const c=state.crop;

    const sx=Math.round(c.x*imageCanvas.width);
    const sy=Math.round(c.y*imageCanvas.height);
    const sw=Math.round(c.w*imageCanvas.width);
    const sh=Math.round(c.h*imageCanvas.height);

    const out=document.createElement("canvas");
    out.width=Math.max(1,sw);
    out.height=Math.max(1,sh);

    const ctx=out.getContext("2d");
    ctx.drawImage(
        state.sourceCanvas,
        sx,sy,sw,sh,
        0,0,sw,sh
    );

    state.sourceCanvas=out;

    imageCanvas.width=sw;
    imageCanvas.height=sh;
    overlayCanvas.width=sw;
    overlayCanvas.height=sh;

    state.crop.active=false;

    fitImage();
    render();
}

function rgbToHsl(r,g,b){
    r/=255;
    g/=255;
    b/=255;

    const max=Math.max(r,g,b);
    const min=Math.min(r,g,b);
    let h=0;
    let s=0;
    const l=(max+min)/2;

    if(max!==min){
        const d=max-min;
        s=l>.5?d/(2-max-min):d/(max+min);

        switch(max){
            case r:h=(g-b)/d+(g<b?6:0);break;
            case g:h=(b-r)/d+2;break;
            case b:h=(r-g)/d+4;break;
        }

        h/=6;
    }

    return {h:h*360,s:s*100,l:l*100};
}

function hue2rgb(p,q,t){
    if(t<0)t+=1;
    if(t>1)t-=1;

    if(t<1/6)return p+(q-p)*6*t;
    if(t<1/2)return q;
    if(t<2/3)return p+(q-p)*(2/3-t)*6;

    return p;
}

function hslToRgb(h,s,l){
    h=((h%360)+360)%360/360;
    s=clamp(s,0,100)/100;
    l=clamp(l,0,100)/100;

    let r,g,b;

    if(s===0){
        r=g=b=l;
    }else{
        const q=l<.5?l*(1+s):l+s-l*s;
        const p=2*l-q;

        r=hue2rgb(p,q,h+1/3);
        g=hue2rgb(p,q,h);
        b=hue2rgb(p,q,h-1/3);
    }

    return {
        r:r*255,
        g:g*255,
        b:b*255
    };
}

function applyColorMix(r,g,b){
    const hsl=rgbToHsl(r,g,b);

    if(state.selective.picked){
        const phsl=rgbToHsl(
            state.selective.picked.r,
            state.selective.picked.g,
            state.selective.picked.b
        );

        let dh=Math.abs(hsl.h-phsl.h);
        if(dh>180)dh=360-dh;

        const influence=
            clamp01(1-dh/state.selective.range);

        hsl.h+=state.selective.hue*influence;
        hsl.s+=state.selective.saturation*influence;
        hsl.l+=state.selective.lightness*influence;
    }

    let dh=Math.abs(hsl.h-state.color.hue);
    if(dh>180)dh=360-dh;

    const mixerInfluence=
        clamp01(1-dh/state.color.hueRange);

    hsl.s+=state.color.mixerSaturation*mixerInfluence;
    hsl.l+=state.color.mixerLightness*mixerInfluence;

    hsl.s+=state.color.saturation;

    const satBoost=
        state.color.vibrance*(1-hsl.s/100);

    hsl.s+=satBoost;

    const gradeLum=hsl.l;

    let gradeHue=0;
    let gradeSat=0;

    if(gradeLum<35){
        gradeHue=state.color.shadowHue;
        gradeSat=state.color.shadowSat;
    }else if(gradeLum>65){
        gradeHue=state.color.highlightHue;
        gradeSat=state.color.highlightSat;
    }else{
        gradeHue=state.color.midHue;
        gradeSat=state.color.midSat;
    }

    const gradeInfluence=
        state.color.gradeBlend/100*(gradeSat/100);

    if(gradeSat>0){
        hsl.h=lerp(hsl.h,gradeHue,gradeInfluence);
        hsl.s+=gradeSat*.35;
    }

    hsl.s=clamp(hsl.s,0,100);
    hsl.l=clamp(hsl.l,0,100);

    return hslToRgb(hsl.h,hsl.s,hsl.l);
}

function adjustTone(v){
    let x=v/255;

    const exposure=state.light.exposure/100;
    x*=Math.pow(2,exposure);

    const contrast=state.light.contrast/100;
    x=(x-.5)*(1+contrast)+.5;

    if(x>.5){
        x+=state.light.highlights/100*(x-.5)*1.5;
        x+=state.light.whites/100*(x-.75);
    }else{
        x+=state.light.shadows/100*(.5-x)*1.5;
        x+=state.light.blacks/100*(x-.25);
    }

    return clamp(x*255);
}

function localMaskWeight(x,y){
    const m=state.mask;

    if(m.type==="None")return 0;

    const cx=m.x/100;
    const cy=m.y/100;

    if(m.type==="Radial"){
        const rx=Math.max(.02,m.width/200);
        const ry=Math.max(.02,m.height/200);

        const d=Math.sqrt(
            Math.pow((x-cx)/rx,2)+
            Math.pow((y-cy)/ry,2)
        );

        const feather=Math.max(.01,m.feather/100);

        return clamp01(
            (1-d)/(feather+.001)
        )*(m.amount/100);
    }

    const distance=Math.abs(y-cy);
    const size=Math.max(.05,m.height/100);

    return clamp01(
        1-distance/size
    )*(m.amount/100);
}

function pixelBlur(data,w,h,radius){
    if(radius<=0)return data;

    const out=new Uint8ClampedArray(data.length);
    const r=Math.max(1,Math.round(radius));

    for(let y=0;y<h;y++){
        for(let x=0;x<w;x++){
            let sr=0,sg=0,sb=0,count=0;

            for(let yy=Math.max(0,y-r);yy<=Math.min(h-1,y+r);yy+=2){
                for(let xx=Math.max(0,x-r);xx<=Math.min(w-1,x+r);xx+=2){
                    const i=(yy*w+xx)*4;
                    sr+=data[i];
                    sg+=data[i+1];
                    sb+=data[i+2];
                    count++;
                }
            }

            const i=(y*w+x)*4;
            out[i]=sr/count;
            out[i+1]=sg/count;
            out[i+2]=sb/count;
            out[i+3]=data[i+3];
        }
    }

    return out;
}

function sharpen(data,w,h,amount){
    if(amount<=0)return data;

    const out=new Uint8ClampedArray(data);
    const a=amount/100;

    for(let y=1;y<h-1;y++){
        for(let x=1;x<w-1;x++){
            const i=(y*w+x)*4;

            for(let c=0;c<3;c++){
                const center=data[i+c];

                const avg=(
                    data[((y-1)*w+x)*4+c]+
                    data[((y+1)*w+x)*4+c]+
                    data[(y*w+x-1)*4+c]+
                    data[(y*w+x+1)*4+c]
                )/4;

                out[i+c]=clamp(center+(center-avg)*a*1.5);
            }
        }
    }

    return out;
}

function applyTextureClarity(data,w,h){
    const amount=
        (state.effects.texture+state.effects.clarity+
        state.mask.texture+state.mask.clarity)/100;

    if(Math.abs(amount)<.001)return data;

    const out=new Uint8ClampedArray(data);

    for(let y=1;y<h-1;y++){
        for(let x=1;x<w-1;x++){
            const i=(y*w+x)*4;

            for(let c=0;c<3;c++){
                const avg=(
                    data[((y-1)*w+x)*4+c]+
                    data[((y+1)*w+x)*4+c]+
                    data[(y*w+x-1)*4+c]+
                    data[(y*w+x+1)*4+c]
                )/4;

                out[i+c]=clamp(
                    data[i+c]+
                    (data[i+c]-avg)*amount*.75
                );
            }
        }
    }

    return out;
}

function applyBlurFocus(data,w,h){
    if(state.blur.amount<=0)return data;

    const radius=Math.max(
        1,
        Math.round(state.blur.amount/10)
    );

    const blurred=pixelBlur(data,w,h,radius);
    const out=new Uint8ClampedArray(data);

    const fx=state.blur.focusX/100;
    const fy=state.blur.focusY/100;
    const fs=Math.max(.02,state.blur.focusSize/100);
    const feather=Math.max(.02,state.blur.feather/100);

    for(let y=0;y<h;y++){
        for(let x=0;x<w;x++){
            const nx=x/w;
            const ny=y/h;

            const d=Math.sqrt(
                Math.pow((nx-fx),2)+
                Math.pow((ny-fy),2)
            );

            const t=clamp01(
                (d-fs)/(feather+.001)
            );

            const i=(y*w+x)*4;

            out[i]=lerp(data[i],blurred[i],t);
            out[i+1]=lerp(data[i+1],blurred[i+1],t);
            out[i+2]=lerp(data[i+2],blurred[i+2],t);
        }
    }

    return out;
}

function applyVignette(data,w,h,amount,midpoint,feather,roundness){
    if(Math.abs(amount)<.01)return data;

    const out=new Uint8ClampedArray(data);

    const a=amount/100;
    const m=midpoint/100;
    const f=Math.max(.05,feather/100);
    const r=roundness/100;

    for(let y=0;y<h;y++){
        for(let x=0;x<w;x++){
            const nx=(x/w-.5)*2;
            const ny=(y/h-.5)*2;

            const d=Math.sqrt(
                Math.pow(nx*(1+r*.35),2)+
                Math.pow(ny*(1-r*.35),2)
            )/Math.SQRT2;

            let t=clamp01((d-m)/f);
            t*=t;

            const factor=1-a*t;

            const i=(y*w+x)*4;

            out[i]=clamp(out[i]*factor);
            out[i+1]=clamp(out[i+1]*factor);
            out[i+2]=clamp(out[i+2]*factor);
        }
    }

    return out;
}

function applyGrain(data,w,h){
    const amount=state.effects.grain/100;

    if(amount<=0)return data;

    const out=new Uint8ClampedArray(data);

    const rough=state.effects.grainRoughness/100;
    const size=Math.max(1,state.effects.grainSize/15);

    for(let y=0;y<h;y++){
        for(let x=0;x<w;x++){
            const i=(y*w+x)*4;

            const n=
                (Math.random()-.5)*
                255*
                amount*
                (.35+.65*rough)/
                size;

            out[i]=clamp(data[i]+n);
            out[i+1]=clamp(data[i+1]+n);
            out[i+2]=clamp(data[i+2]+n);
        }
    }

    return out;
}

function applyDefringe(data,w,h,amount){
    if(amount<=0)return data;

    const out=new Uint8ClampedArray(data);
    const a=amount/100;

    for(let y=0;y<h;y++){
        for(let x=0;x<w;x++){
            const i=(y*w+x)*4;

            const max=Math.max(data[i],data[i+1],data[i+2]);
            const min=Math.min(data[i],data[i+1],data[i+2]);

            if(max-min>45){
                out[i]=lerp(data[i],data[i+1],a*.15);
                out[i+2]=lerp(data[i+2],data[i+1],a*.15);
            }
        }
    }

    return out;
}

function applyRetouch(data,w,h){
    if(!state.retouch.strokes.length)return data;

    const out=new Uint8ClampedArray(data);

    state.retouch.strokes.forEach(stroke=>{
        stroke.points.forEach(p=>{
            const r=stroke.size;
            const minX=Math.max(0,Math.floor(p.x-r));
            const maxX=Math.min(w-1,Math.ceil(p.x+r));
            const minY=Math.max(0,Math.floor(p.y-r));
            const maxY=Math.min(h-1,Math.ceil(p.y+r));

            for(let y=minY;y<=maxY;y++){
                for(let x=minX;x<=maxX;x++){
                    const d=Math.hypot(x-p.x,y-p.y);

                    if(d>r)continue;

                    const t=1-d/r;
                    const fall=Math.pow(t,1+stroke.feather/50);
                    const i=(y*w+x)*4;

                    out[i]=lerp(out[i],128,fall*stroke.opacity/100*.18);
                    out[i+1]=lerp(out[i+1],128,fall*stroke.opacity/100*.18);
                    out[i+2]=lerp(out[i+2],128,fall*stroke.opacity/100*.18);
                }
            }
        });
    });

    return out;
}

function processImage(){
    const w=imageCanvas.width;
    const h=imageCanvas.height;

    if(!state.sourceCanvas)return;

    const source=state.sourceCanvas
        .getContext("2d")
        .getImageData(0,0,w,h);

    let data=new Uint8ClampedArray(source.data);

    if(state.before)return data;

    const pixelCount=w*h;

    for(let i=0;i<data.length;i+=4){
        let r=data[i];
        let g=data[i+1];
        let b=data[i+2];

        r=adjustTone(r);
        g=adjustTone(g);
        b=adjustTone(b);

        r+=state.color.temperature*0.45;
        b-=state.color.temperature*0.45;

        g+=state.color.tint*.25;
        r-=state.color.tint*.1;
        b-=state.color.tint*.1;

        const rgb=applyColorMix(r,g,b);

        r=rgb.r;
        g=rgb.g;
        b=rgb.b;

        const x=(i/4)%w/w;
        const y=Math.floor((i/4)/w)/h;

        const mw=localMaskWeight(x,y);

        if(mw>0){
            r*=1+(state.mask.exposure/100)*mw;
            g*=1+(state.mask.exposure/100)*mw;
            b*=1+(state.mask.exposure/100)*mw;

            const mhsl=rgbToHsl(r,g,b);

            mhsl.h+=state.mask.hue*mw;
            mhsl.s+=state.mask.saturation*mw;

            const mRgb=hslToRgb(
                mhsl.h,
                mhsl.s,
                mhsl.l
            );

            r=lerp(r,mRgb.r,mw);
            g=lerp(g,mRgb.g,mw);
            b=lerp(b,mRgb.b,mw);

            const mc=1+(state.mask.contrast/100)*mw;

            r=(r-128)*mc+128;
            g=(g-128)*mc+128;
            b=(b-128)*mc+128;
        }

        data[i]=clamp(r);
        data[i+1]=clamp(g);
        data[i+2]=clamp(b);
    }

    data=applyTextureClarity(data,w,h);

    const noise=state.detail.noiseReduction/100;

    if(noise>0){
        data=pixelBlur(
            data,
            w,
            h,
            1+noise*2
        );
    }

    const cnoise=state.detail.colorNoise/100;

    if(cnoise>0){
        for(let i=0;i<data.length;i+=4){
            const avg=(data[i]+data[i+1]+data[i+2])/3;

            data[i]=lerp(data[i],avg,cnoise);
            data[i+1]=lerp(data[i+1],avg,cnoise);
            data[i+2]=lerp(data[i+2],avg,cnoise);
        }
    }

    data=applyDefringe(
        data,
        w,
        h,
        state.optics.defringe
    );

    const sharp=
        state.detail.sharpening+
        state.effects.texture*.2+
        state.effects.clarity*.25;

    if(sharp>0){
        data=sharpen(
            data,
            w,
            h,
            Math.min(100,sharp)
        );
    }

    data=applyBlurFocus(data,w,h);

    data=applyVignette(
        data,
        w,
        h,
        state.effects.vignette+
        state.optics.vignette,
        state.effects.midpoint,
        state.effects.feather,
        state.effects.roundness
    );

    data=applyGrain(data,w,h);

    return data;
}

function render(){
    if(!state.sourceCanvas)return;

    const w=imageCanvas.width;
    const h=imageCanvas.height;

    const data=processImage();

    const output=imageCtx.createImageData(w,h);
    output.data.set(data);

    imageCtx.putImageData(output,0,0);

    renderOverlays();
    updateTransform();

    if(state.tool==="crop"&&state.crop.active){
        $("imageCanvas").style.filter="none";
    }
}

function exportImage(){
    if(!state.sourceCanvas){
        alert("Please open an image first.");
        return;
    }

    setStatus("Preparing export...");

    const format=$("exportFormat").value;
    const quality=Number($("exportQuality").value)/100;
    const size=$("exportSize").value;
    const include=$("includeOverlays").checked;

    const source=document.createElement("canvas");

    let w=imageCanvas.width;
    let h=imageCanvas.height;

    if(size!=="original"){
        const max=Number(size);
        const scale=Math.min(1,max/Math.max(w,h));
        w=Math.max(1,Math.round(w*scale));
        h=Math.max(1,Math.round(h*scale));
    }

    source.width=w;
    source.height=h;

    const ctx=source.getContext("2d");

    const temp=document.createElement("canvas");
    temp.width=imageCanvas.width;
    temp.height=imageCanvas.height;

    const tctx=temp.getContext("2d");

    const processed=processImage();

    const id=tctx.createImageData(
        imageCanvas.width,
        imageCanvas.height
    );

    id.data.set(processed);
    tctx.putImageData(id,0,0);

    ctx.drawImage(temp,0,0,w,h);

    if(include){
        ctx.drawImage(
            overlayCanvas,
            0,0,
            overlayCanvas.width,
            overlayCanvas.height,
            0,0,w,h
        );
    }

    source.toBlob(blob=>{
        if(!blob){
            setStatus("Export failed");
            return;
        }

        const ext=
            format==="image/png"?"png":
            format==="image/webp"?"webp":"jpg";

        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");

        a.href=url;
        a.download=`toolora-edited-${Date.now()}.${ext}`;

        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(()=>{
            URL.revokeObjectURL(url);
        },1000);

        setStatus("Export complete");
    },format,quality);
}

document.addEventListener("keydown",e=>{
    const key=e.key.toLowerCase();

    if((e.ctrlKey||e.metaKey)&&key==="z"){
        e.preventDefault();

        if(e.shiftKey)redo();
        else undo();
    }

    if((e.ctrlKey||e.metaKey)&&key==="y"){
        e.preventDefault();
        redo();
    }
});

window.addEventListener("resize",()=>{
    if(state.sourceCanvas)updateTransform();
});

switchTool("light");
updateHistoryButtons();
