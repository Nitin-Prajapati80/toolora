"use strict";

const $ = id => document.getElementById(id);

const canvas = $("editorCanvas");
const ctx = canvas.getContext("2d", {
    willReadFrequently: true
});

const state = {

    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    brightness: 0,

    temperature: 0,
    tint: 0,
    vibrance: 0,
    saturation: 0,

    texture: 0,
    clarity: 0,
    dehaze: 0,
    vignette: 0,
    grain: 0,

    sharpen: 0,
    noise: 0,

    blur: 0,

    filter: "None",

    crop: "Free",

    targetHue: 0,
    targetRange: 20,
    targetSaturation: 0,
    targetLuminance: 0,
    targetSmoothness: 50,

    brushSize: 8,
    brushOpacity: 100,
    brushColor: "#ffffff",

    textSize: 32,
    textColor: "#ffffff",
    textOpacity: 100,
    textBold: false,
    textItalic: false,
    textUnderline: false,
    textAlign: "left",
    textFont: "Arial",
    textLetterSpacing: 0,
    textBackground: false,
    textBackgroundColor: "#000000",

    format: "image/jpeg",
    quality: 92,
    maxEdge: 3000
};


let sourceCanvas = null;
let originalImageData = null;

let history = [];
let future = [];

let activeTool = "light";

let renderFrame = 0;

let beforeMode = false;

let selectedText = null;
let draggingText = false;

let drawMode = false;
let currentPath = null;

let targetColor = null;


/* -------------------------------------------------------
   BASIC HELPERS
------------------------------------------------------- */

function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
}

function status(message){
    $("statusText").textContent = message;
}

function cloneState(){
    return structuredClone(state);
}

function createSnapshot(){

    if(!sourceCanvas) return;

    return {
        image: canvas.toDataURL("image/png"),
        state: cloneState(),
        objects: structuredClone(objects)
    };
}

function pushHistory(){

    const snapshot = createSnapshot();

    if(!snapshot) return;

    history.push(snapshot);

    if(history.length > 30){
        history.shift();
    }

    future = [];

    updateHistoryButtons();
}

function updateHistoryButtons(){

    $("undoBtn").disabled = history.length === 0;
    $("redoBtn").disabled = future.length === 0;
}


/* -------------------------------------------------------
   OBJECTS
------------------------------------------------------- */

const objects = [];


/* -------------------------------------------------------
   FILE OPEN
------------------------------------------------------- */

$("openBtn").onclick = () => $("fileInput").click();

$("openCenter").onclick = () => $("fileInput").click();

$("fileInput").addEventListener("change", event => {

    const file = event.target.files[0];

    if(file){
        openImage(file);
    }

});


function openImage(file){

    if(!file.type.startsWith("image/")){

        status("Please choose a valid image");

        return;
    }

    const url = URL.createObjectURL(file);

    const image = new Image();

    image.onload = () => {

        URL.revokeObjectURL(url);

        const maxSize = 2400;

        const scale =
            Math.min(
                1,
                maxSize /
                Math.max(
                    image.naturalWidth,
                    image.naturalHeight
                )
            );

        sourceCanvas = document.createElement("canvas");

        sourceCanvas.width =
            Math.max(
                1,
                Math.round(image.naturalWidth * scale)
            );

        sourceCanvas.height =
            Math.max(
                1,
                Math.round(image.naturalHeight * scale)
            );

        const sourceContext =
            sourceCanvas.getContext("2d");

        sourceContext.drawImage(
            image,
            0,
            0,
            sourceCanvas.width,
            sourceCanvas.height
        );

        canvas.width = sourceCanvas.width;
        canvas.height = sourceCanvas.height;

        ctx.drawImage(
            sourceCanvas,
            0,
            0
        );

        originalImageData =
            ctx.getImageData(
                0,
                0,
                canvas.width,
                canvas.height
            );

        objects.length = 0;

        history = [];
        future = [];

        $("emptyState").style.display = "none";
        canvas.style.display = "block";

        $("fileName").textContent = file.name;

        $("imageInfo").textContent =
            `${image.naturalWidth} × ${image.naturalHeight}`;

        $("beforeBtn").disabled = false;
        $("exportTop").disabled = false;

        updateHistoryButtons();

        render();

        renderControls();

        status("Photo loaded");

    };

    image.onerror = () => {

        URL.revokeObjectURL(url);

        status("Unable to open this image");

    };

    image.src = url;
}


/* -------------------------------------------------------
   UNDO / REDO
------------------------------------------------------- */

$("undoBtn").onclick = undo;

$("redoBtn").onclick = redo;


function undo(){

    if(!history.length) return;

    const current = createSnapshot();

    future.push(current);

    const previous = history.pop();

    restoreSnapshot(previous);

    updateHistoryButtons();

}


function redo(){

    if(!future.length) return;

    const current = createSnapshot();

    history.push(current);

    const next = future.pop();

    restoreSnapshot(next);

    updateHistoryButtons();

}


function restoreSnapshot(snapshot){

    const image = new Image();

    image.onload = () => {

        canvas.width = image.width;
        canvas.height = image.height;

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.drawImage(
            image,
            0,
            0
        );

        Object.assign(
            state,
            snapshot.state
        );

        objects.length = 0;

        snapshot.objects.forEach(
            object => objects.push(object)
        );

        render();

        renderControls();

        status("Step restored");

    };

    image.src = snapshot.image;
}


/* -------------------------------------------------------
   BEFORE / AFTER
------------------------------------------------------- */

$("beforeBtn").onclick = () => {

    if(!originalImageData) return;

    beforeMode = !beforeMode;

    if(beforeMode){

        ctx.putImageData(
            originalImageData,
            0,
            0
        );

        $("beforeBtn").textContent = "After";

        status("Original photo");

    }else{

        $("beforeBtn").textContent = "Before";

        render();

        status("Edited photo");

    }

};


/* -------------------------------------------------------
   COLOR ENGINE
------------------------------------------------------- */

function rgbToHsl(r,g,b){

    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r,g,b);
    const min = Math.min(r,g,b);

    let h = 0;
    let s = 0;

    const l = (max + min) / 2;

    if(max !== min){

        const d = max - min;

        s =
            l > .5
            ? d / (2 - max - min)
            : d / (max + min);

        switch(max){

            case r:
                h =
                    (g - b) / d +
                    (g < b ? 6 : 0);
                break;

            case g:
                h =
                    (b - r) / d + 2;
                break;

            case b:
                h =
                    (r - g) / d + 4;
                break;

        }

        h /= 6;
    }

    return {
        h: h * 360,
        s: s * 100,
        l: l * 100
    };
}


function hslToRgb(h,s,l){

    h /= 360;
    s /= 100;
    l /= 100;

    if(s === 0){

        const v = Math.round(l * 255);

        return [v,v,v];

    }

    const hue2rgb = (p,q,t) => {

        if(t < 0) t += 1;
        if(t > 1) t -= 1;

        if(t < 1/6)
            return p + (q-p)*6*t;

        if(t < 1/2)
            return q;

        if(t < 2/3)
            return p + (q-p)*(2/3-t)*6;

        return p;

    };

    const q =
        l < .5
        ? l * (1+s)
        : l+s-l*s;

    const p = 2*l-q;

    return [
        Math.round(
            hue2rgb(p,q,h+1/3)*255
        ),
        Math.round(
            hue2rgb(p,q,h)*255
        ),
        Math.round(
            hue2rgb(p,q,h-1/3)*255
        )
    ];
}


/* -------------------------------------------------------
   IMAGE ADJUSTMENTS
------------------------------------------------------- */

function processPixels(imageData){

    const data = imageData.data;

    const exposure =
        Math.pow(
            2,
            state.exposure / 100
        );

    const contrast =
        state.contrast / 100;

    const saturation =
        1 + state.saturation / 100;

    const vibrance =
        state.vibrance / 100;

    for(let i=0;i<data.length;i+=4){

        let r = data[i];
        let g = data[i+1];
        let b = data[i+2];

        r *= exposure;
        g *= exposure;
        b *= exposure;

        r += state.brightness;
        g += state.brightness;
        b += state.brightness;

        r =
            (r-128) *
            (1+contrast) +
            128;

        g =
            (g-128) *
            (1+contrast) +
            128;

        b =
            (b-128) *
            (1+contrast) +
            128;


        const luminance =
            .2126*r +
            .7152*g +
            .0722*b;


        const shadowAmount =
            state.shadows / 100;

        if(luminance < 128){

            r += (128-r)*shadowAmount*.45;
            g += (128-g)*shadowAmount*.45;
            b += (128-b)*shadowAmount*.45;

        }


        const highlightAmount =
            state.highlights / 100;

        if(luminance > 128){

            r += (128-r)*highlightAmount*.35;
            g += (128-g)*highlightAmount*.35;
            b += (128-b)*highlightAmount*.35;

        }


        r += state.temperature*.35;
        b -= state.temperature*.35;

        g += state.tint*.15;


        const gray =
            .299*r +
            .587*g +
            .114*b;

        const vibranceFactor =
            1 +
            vibrance *
            (1 -
            Math.abs(
                2*gray/255 - 1
            ));

        r =
            gray +
            (r-gray) *
            saturation *
            vibranceFactor;

        g =
            gray +
            (g-gray) *
            saturation *
            vibranceFactor;

        b =
            gray +
            (b-gray) *
            saturation *
            vibranceFactor;


        /* Target color adjustment */

        if(targetColor){

            const hsl =
                rgbToHsl(r,g,b);

            let distance =
                Math.abs(
                    hsl.h -
                    targetColor.h
                );

            if(distance > 180)
                distance = 360-distance;

            const range =
                Math.max(
                    1,
                    state.targetRange
                );

            let influence =
                1 -
                distance/range;

            influence =
                clamp(
                    influence,
                    0,
                    1
                );

            influence *=
                state.targetSmoothness/100;

            hsl.s +=
                state.targetSaturation *
                influence;

            hsl.l +=
                state.targetLuminance *
                influence;

            const rgb =
                hslToRgb(
                    hsl.h,
                    hsl.s,
                    hsl.l
                );

            r =
                r*(1-influence) +
                rgb[0]*influence;

            g =
                g*(1-influence) +
                rgb[1]*influence;

            b =
                b*(1-influence) +
                rgb[2]*influence;
        }


        /* Filters */

        if(state.filter === "Mono"){

            r = g = b = gray;

        }

        if(state.filter === "Warm"){

            r *= 1.08;
            g *= 1.02;
            b *= .92;

        }

        if(state.filter === "Cool"){

            r *= .92;
            g *= 1.02;
            b *= 1.09;

        }

        if(state.filter === "Vintage"){

            r = r*.92+15;
            g = g*.86+12;
            b = b*.75+8;

        }

        if(state.filter === "Fade"){

            r = r*.86+22;
            g = g*.86+22;
            b = b*.86+22;

        }

        if(state.filter === "Vivid"){

            r =
                gray +
                (r-gray)*1.3;

            g =
                gray +
                (g-gray)*1.3;

            b =
                gray +
                (b-gray)*1.3;

        }

        if(state.filter === "Cinematic"){

            r *= 1.04;
            g *= .97;
            b *= 1.05;

        }


        data[i] =
            clamp(r,0,255);

        data[i+1] =
            clamp(g,0,255);

        data[i+2] =
            clamp(b,0,255);
    }


    /* Vignette */

    if(state.vignette > 0){

        const w =
            imageData.width;

        const h =
            imageData.height;

        const cx = w/2;
        const cy = h/2;

        const maxDistance =
            Math.sqrt(
                cx*cx +
                cy*cy
            );

        const amount =
            state.vignette/100;

        for(let y=0;y<h;y++){

            for(let x=0;x<w;x++){

                const distance =
                    Math.sqrt(
                        (x-cx)**2 +
                        (y-cy)**2
                    ) /
                    maxDistance;

                const factor =
                    1 -
                    amount *
                    Math.pow(distance,2) *
                    .85;

                const i =
                    (y*w+x)*4;

                data[i] *= factor;
                data[i+1] *= factor;
                data[i+2] *= factor;
            }
        }
    }

    return imageData;
}


/* -------------------------------------------------------
   RENDER
------------------------------------------------------- */

function render(){

    if(!sourceCanvas || beforeMode)
        return;

    cancelAnimationFrame(renderFrame);

    renderFrame =
        requestAnimationFrame(() => {

            ctx.clearRect(
                0,
                0,
                canvas.width,
                canvas.height
            );

            ctx.drawImage(
                sourceCanvas,
                0,
                0,
                canvas.width,
                canvas.height
            );

            let data =
                ctx.getImageData(
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

            data =
                processPixels(data);

            ctx.putImageData(
                data,
                0,
                0
            );

            if(state.blur > 0){

                const temp =
                    document.createElement(
                        "canvas"
                    );

                temp.width =
                    canvas.width;

                temp.height =
                    canvas.height;

                temp.getContext("2d")
                    .drawImage(
                        canvas,
                        0,
                        0
                    );

                ctx.save();

                ctx.filter =
                    `blur(${state.blur}px)`;

                ctx.drawImage(
                    temp,
                    0,
                    0
                );

                ctx.restore();
            }

            drawObjects();

            if(state.sharpen > 0)
                sharpen();

        });
}


/* -------------------------------------------------------
   SHARPEN
------------------------------------------------------- */

function sharpen(){

    const width =
        canvas.width;

    const height =
        canvas.height;

    const source =
        ctx.getImageData(
            0,
            0,
            width,
            height
        );

    const output =
        ctx.createImageData(
            width,
            height
        );

    output.data.set(
        source.data
    );

    const a =
        source.data;

    const b =
        output.data;

    const strength =
        state.sharpen / 100;

    for(
        let y=1;
        y<height-1;
        y++
    ){

        for(
            let x=1;
            x<width-1;
            x++
        ){

            const i =
                (y*width+x)*4;

            for(
                let c=0;
                c<3;
                c++
            ){

                const value =
                    a[i+c]*5 -
                    a[i-4+c] -
                    a[i+4+c] -
                    a[i-width*4+c] -
                    a[i+width*4+c];

                b[i+c] =
                    clamp(
                        a[i+c] +
                        (value-a[i+c])*
                        strength,
                        0,
                        255
                    );
            }
        }
    }

    ctx.putImageData(
        output,
        0,
        0
    );
}


/* -------------------------------------------------------
   OBJECT RENDERING
------------------------------------------------------- */

function drawObjects(){

    objects.forEach(object => {

        ctx.save();

        ctx.globalAlpha =
            object.opacity/100;

        ctx.translate(
            object.x,
            object.y
        );

        ctx.rotate(
            (object.rotation || 0) *
            Math.PI/180
        );

        if(object.type === "text"){

            const style =
                object.italic
                ? "italic "
                : "";

            const weight =
                object.bold
                ? "bold "
                : "";

            ctx.font =
                `${style}${weight}${object.size}px ${object.font}`;

            ctx.textAlign =
                object.align;

            ctx.textBaseline =
                "middle";

            const textWidth =
                ctx.measureText(
                    object.text
                ).width;

            if(object.background){

                ctx.fillStyle =
                    object.backgroundColor;

                ctx.fillRect(
                    -textWidth/2-10,
                    -object.size/2-8,
                    textWidth+20,
                    object.size+16
                );
            }

            ctx.fillStyle =
                object.color;

            ctx.fillText(
                object.text,
                0,
                0
            );

            if(object.underline){

                ctx.fillRect(
                    -textWidth/2,
                    object.size/2+3,
                    textWidth,
                    2
                );
            }

        }


        if(object.type === "shape"){

            ctx.strokeStyle =
                object.color;

            ctx.lineWidth =
                object.lineWidth;

            if(object.shape === "circle"){

                ctx.beginPath();

                ctx.arc(
                    0,
                    0,
                    object.radius,
                    0,
                    Math.PI*2
                );

                ctx.stroke();

            }else{

                ctx.strokeRect(
                    -object.width/2,
                    -object.height/2,
                    object.width,
                    object.height
                );
            }
        }


        if(object.type === "draw"){

            ctx.strokeStyle =
                object.color;

            ctx.lineWidth =
                object.size;

            ctx.lineCap =
                "round";

            ctx.lineJoin =
                "round";

            ctx.beginPath();

            object.points.forEach(
                (point,index) => {

                    if(index === 0)
                        ctx.moveTo(
                            point.x,
                            point.y
                        );
                    else
                        ctx.lineTo(
                            point.x,
                            point.y
                        );
                }
            );

            ctx.stroke();
        }

        ctx.restore();

    });

}


/* -------------------------------------------------------
   TARGET COLOR TOOL
------------------------------------------------------- */

function sampleColorAt(event){

    if(!sourceCanvas)
        return;

    const rect =
        canvas.getBoundingClientRect();

    const x =
        Math.round(
            (event.clientX-rect.left) *
            canvas.width /
            rect.width
        );

    const y =
        Math.round(
            (event.clientY-rect.top) *
            canvas.height /
            rect.height
        );

    if(
        x < 0 ||
        y < 0 ||
        x >= canvas.width ||
        y >= canvas.height
    )
        return;

    const pixel =
        ctx.getImageData(
            x,
            y,
            1,
            1
        ).data;

    const hsl =
        rgbToHsl(
            pixel[0],
            pixel[1],
            pixel[2]
        );

    targetColor = {
        r: pixel[0],
        g: pixel[1],
        b: pixel[2],
        h: hsl.h
    };

    state.targetHue =
        Math.round(hsl.h);

    renderControls();

    status(
        `Selected color: RGB(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`
    );
}


/* Only Target tool uses click */

canvas.addEventListener(
    "pointerdown",
    event => {

        if(activeTool === "target"){

            sampleColorAt(event);

            return;
        }

        if(activeTool !== "draw")
            return;

        startDrawing(event);
    }
);


/* -------------------------------------------------------
   DRAWING
------------------------------------------------------- */

function getCanvasPoint(event){

    const rect =
        canvas.getBoundingClientRect();

    return {
        x:
            (event.clientX-rect.left) *
            canvas.width /
            rect.width,

        y:
            (event.clientY-rect.top) *
            canvas.height /
            rect.height
    };
}


function startDrawing(event){

    pushHistory();

    drawMode = true;

    canvas.setPointerCapture(
        event.pointerId
    );

    const point =
        getCanvasPoint(event);

    currentPath = {

        type:"draw",

        x:0,

        y:0,

        color:state.brushColor,

        size:
            state.brushSize *
            Math.max(
                1,
                canvas.width/800
            ),

        opacity:
            state.brushOpacity,

        rotation:0,

        points:[point]
    };

    objects.push(currentPath);
}


canvas.addEventListener(
    "pointermove",
    event => {

        if(
            !drawMode ||
            !currentPath
        )
            return;

        const point =
            getCanvasPoint(event);

        currentPath.points.push(
            point
        );

        render();

    }
);


function finishDrawing(){

    if(!drawMode)
        return;

    drawMode = false;

    currentPath = null;

    render();
}


canvas.addEventListener(
    "pointerup",
    finishDrawing
);

canvas.addEventListener(
    "pointercancel",
    finishDrawing
);


/* -------------------------------------------------------
   TEXT MOVEMENT
------------------------------------------------------- */

canvas.addEventListener(
    "pointerdown",
    event => {

        if(activeTool !== "text")
            return;

        const point =
            getCanvasPoint(event);

        const hit =
            findTextAt(
                point.x,
                point.y
            );

        if(hit){

            selectedText = hit;

            draggingText = true;

            canvas.setPointerCapture(
                event.pointerId
            );

            hit._dragOffsetX =
                point.x-hit.x;

            hit._dragOffsetY =
                point.y-hit.y;

            status("Drag text to move it");

        }

    }
);


canvas.addEventListener(
    "pointermove",
    event => {

        if(
            !draggingText ||
            !selectedText
        )
            return;

        const point =
            getCanvasPoint(event);

        selectedText.x =
            point.x -
            selectedText._dragOffsetX;

        selectedText.y =
            point.y -
            selectedText._dragOffsetY;

        render();

    }
);


canvas.addEventListener(
    "pointerup",
    () => {

        if(draggingText){

            draggingText = false;

            pushHistory();

            render();

        }

    }
);


function findTextAt(x,y){

    for(
        let i=objects.length-1;
        i>=0;
        i--
    ){

        const object =
            objects[i];

        if(object.type !== "text")
            continue;

        const width =
            object.size *
            object.text.length *
            .65;

        const height =
            object.size*1.5;

        if(
            x >= object.x-width/2 &&
            x <= object.x+width/2 &&
            y >= object.y-height/2 &&
            y <= object.y+height/2
        ){

            return object;
        }
    }

    return null;
}


/* -------------------------------------------------------
   TOOLS
------------------------------------------------------- */

const toolNames = {

    light:"Light",
    color:"Color",
    target:"Target Color",
    effects:"Effects",
    detail:"Detail",
    crop:"Crop",
    filters:"Filters",
    draw:"Draw",
    text:"Text",
    shapes:"Shapes",
    blur:"Blur",
    export:"Export"
};


$("toolTabs").addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                "[data-tool]"
            );

        if(!button)
            return;

        activeTool =
            button.dataset.tool;

        document
            .querySelectorAll(
                "#toolTabs button"
            )
            .forEach(
                item =>
                    item.classList.toggle(
                        "active",
                        item === button
                    )
            );

        selectedText = null;

        renderControls();
    }
);


/* -------------------------------------------------------
   SLIDER
------------------------------------------------------- */

function slider(
    key,
    label,
    min,
    max
){

    return `
        <div class="control">

            <label>
                <span>${label}</span>

                <output id="${key}Value">
                    ${state[key]}
                </output>
            </label>

            <input
                id="${key}"
                type="range"
                min="${min}"
                max="${max}"
                value="${state[key]}"
            >

        </div>
    `;
}


/* -------------------------------------------------------
   CONTROLS
------------------------------------------------------- */

function renderControls(){

    $("toolTitle").textContent =
        toolNames[activeTool];

    if(!sourceCanvas){

        $("controls").innerHTML =
            `<div class="empty-controls">
                Open a photo to begin.
            </div>`;

        return;
    }


    let html = "";


    if(activeTool === "light"){

        html = `
            <div class="group">

                <h3 class="group-title">
                    Basic Light
                </h3>

                ${slider("exposure","Exposure",-100,100)}
                ${slider("contrast","Contrast",-100,100)}
                ${slider("highlights","Highlights",-100,100)}
                ${slider("shadows","Shadows",-100,100)}
                ${slider("whites","Whites",-100,100)}
                ${slider("blacks","Blacks",-100,100)}
                ${slider("brightness","Brightness",-100,100)}

            </div>
        `;
    }


    if(activeTool === "color"){

        html = `
            <div class="group">

                <h3 class="group-title">
                    Color
                </h3>

                ${slider("temperature","Temperature",-100,100)}
                ${slider("tint","Tint",-100,100)}
                ${slider("vibrance","Vibrance",-100,100)}
                ${slider("saturation","Saturation",-100,100)}

            </div>

            <div class="group">

                <h3 class="group-title">
                    Quick Color
                </h3>

                <button id="neutralColor">
                    Reset Color
                </button>

            </div>
        `;
    }


    if(activeTool === "target"){

        let colorHTML = "";

        if(targetColor){

            colorHTML = `
                <div class="color-result">

                    <div
                        class="color-preview"
                        style="
                            background:
                            rgb(
                                ${targetColor.r},
                                ${targetColor.g},
                                ${targetColor.b}
                            )
                        "
                    ></div>

                    <div class="color-info">

                        <strong>
                            Selected Color
                        </strong>

                        <small>
                            RGB:
                            ${targetColor.r},
                            ${targetColor.g},
                            ${targetColor.b}
                        </small>

                    </div>

                </div>
            `;

        }

        html = `

            <div class="group">

                <h3 class="group-title">
                    Select Color
                </h3>

                ${colorHTML}

                <p class="note">
                    Click any area of the photo.
                    Toolora will sample that color
                    and let you adjust similar colors.
                </p>

                ${slider("targetRange","Color Range",1,90)}
                ${slider("targetSmoothness","Smoothness",1,100)}
                ${slider("targetSaturation","Saturation",-100,100)}
                ${slider("targetLuminance","Luminance",-100,100)}

                <button id="clearTarget">
                    Clear Color Selection
                </button>

            </div>
        `;
    }


    if(activeTool === "effects"){

        html = `
            <div class="group">

                <h3 class="group-title">
                    Effects
                </h3>

                ${slider("texture","Texture",0,100)}
                ${slider("clarity","Clarity",-100,100)}
                ${slider("dehaze","Dehaze",-100,100)}
                ${slider("vignette","Vignette",0,100)}
                ${slider("grain","Grain",0,100)}

            </div>
        `;
    }


    if(activeTool === "detail"){

        html = `
            <div class="group">

                <h3 class="group-title">
                    Detail
                </h3>

                ${slider("sharpen","Sharpening",0,100)}
                ${slider("noise","Noise Reduction",0,100)}

            </div>
        `;
    }


    if(activeTool === "blur"){

        html = `
            <div class="group">

                <h3 class="group-title">
                    Blur
                </h3>

                ${slider("blur","Blur Amount",0,12)}

                <p class="note">
                    Applies a smooth global blur effect.
                </p>

            </div>
        `;
    }


    if(activeTool === "filters"){

        const filters = [
            "None",
            "Mono",
            "Warm",
            "Cool",
            "Vintage",
            "Fade",
            "Vivid",
            "Cinematic"
        ];

        html = `
            <div class="group">

                <h3 class="group-title">
                    Presets
                </h3>

                <div class="preset-grid">

                    ${filters.map(filter => `
                        <button
                            class="preset ${
                                state.filter === filter
                                ? "active"
                                : ""
                            }"
                            data-filter="${filter}"
                        >
                            ${filter}
                        </button>
                    `).join("")}

                </div>

            </div>
        `;
    }


    if(activeTool === "draw"){

        html = `
            <div class="group">

                <h3 class="group-title">
                    Brush
                </h3>

                <div class="control">

                    <label>
                        Brush Color
                    </label>

                    <input
                        id="brushColor"
                        type="color"
                        value="${state.brushColor}"
                    >

                </div>

                ${slider("brushSize","Size",1,60)}
                ${slider("brushOpacity","Opacity",1,100)}

                <button id="clearObjects">
                    Clear Drawing
                </button>

                <p class="note">
                    Draw directly on the image
                    using touch or mouse.
                </p>

            </div>
        `;
    }


    if(activeTool === "text"){

        html = `

            <div class="group">

                <h3 class="group-title">
                    Text
                </h3>

                <div class="control">

                    <label>
                        Text
                    </label>

                    <input
                        id="textInput"
                        type="text"
                        placeholder="Enter text"
                    >

                </div>


                <div class="control">

                    <label>
                        Font
                    </label>

                    <select id="textFont">

                        <option value="Arial">
                            Arial
                        </option>

                        <option value="Verdana">
                            Verdana
                        </option>

                        <option value="Georgia">
                            Georgia
                        </option>

                        <option value="Times New Roman">
                            Times New Roman
                        </option>

                        <option value="Courier New">
                            Courier New
                        </option>

                        <option value="Trebuchet MS">
                            Trebuchet MS
                        </option>

                        <option value="Impact">
                            Impact
                        </option>

                        <option value="Comic Sans MS">
                            Comic Sans MS
                        </option>

                    </select>

                </div>


                ${slider("textSize","Size",10,180)}
                ${slider("textOpacity","Opacity",1,100)}
                ${slider("textLetterSpacing","Letter Spacing",-10,30)}


                <div class="control">

                    <label>
                        Text Color
                    </label>

                    <input
                        id="textColor"
                        type="color"
                        value="${state.textColor}"
                    >

                </div>


                <div class="text-style-row">

                    <button
                        id="textBold"
                        class="style-btn ${
                            state.textBold
                            ? "active"
                            : ""
                        }"
                    >
                        B
                    </button>

                    <button
                        id="textItalic"
                        class="style-btn ${
                            state.textItalic
                            ? "active"
                            : ""
                        }"
                    >
                        I
                    </button>

                    <button
                        id="textUnderline"
                        class="style-btn ${
                            state.textUnderline
                            ? "active"
                            : ""
                        }"
                    >
                        U
                    </button>

                    <button
                        id="textBackground"
                        class="style-btn ${
                            state.textBackground
                            ? "active"
                            : ""
                        }"
                    >
                        BG
                    </button>

                </div>


                <div class="control">

                    <label>
                        Background Color
                    </label>

                    <input
                        id="textBackgroundColor"
                        type="color"
                        value="${state.textBackgroundColor}"
                    >

                </div>


                <div class="control">

                    <label>
                        Alignment
                    </label>

                    <select id="textAlign">

                        <option value="left">
                            Left
                        </option>

                        <option value="center">
                            Center
                        </option>

                        <option value="right">
                            Right
                        </option>

                    </select>

                </div>


                <button
                    id="addText"
                    class="primary-btn"
                    style="width:100%"
                >
                    Add Text
                </button>


                ${
                    selectedText
                    ?
                    `
                    <hr>

                    <button
                        id="deleteText"
                        class="danger"
                        style="width:100%"
                    >
                        Delete Selected Text
                    </button>

                    <p class="note">
                        Drag the selected text
                        directly on the photo
                        to move it.
                    </p>
                    `
                    :
                    `
                    <p class="note">
                        After adding text,
                        drag it anywhere on
                        the photo.
                    </p>
                    `
                }

            </div>
        `;
    }


    if(activeTool === "shapes"){

        html = `

            <div class="group">

                <h3 class="group-title">
                    Shapes
                </h3>

                <select id="shapeType">

                    <option value="rectangle">
                        Rectangle
                    </option>

                    <option value="circle">
                        Circle
                    </option>

                </select>

                <br><br>

                <input
                    id="shapeColor"
                    type="color"
                    value="#ffffff"
                >

                <br><br>

                <button
                    id="addShape"
                    class="primary-btn"
                >
                    Add Shape
                </button>

            </div>
        `;
    }


    if(activeTool === "crop"){

        html = `

            <div class="group">

                <h3 class="group-title">
                    Aspect Ratio
                </h3>

                <select id="cropRatio">

                    <option value="Free">
                        Free
                    </option>

                    <option value="1:1">
                        1:1
                    </option>

                    <option value="4:5">
                        4:5
                    </option>

                    <option value="3:4">
                        3:4
                    </option>

                    <option value="16:9">
                        16:9
                    </option>

                    <option value="9:16">
                        9:16
                    </option>

                    <option value="3:2">
                        3:2
                    </option>

                    <option value="2:3">
                        2:3
                    </option>

                </select>

                <br><br>

                <button
                    id="applyCrop"
                    class="primary-btn"
                    style="width:100%"
                >
                    Apply Center Crop
                </button>

            </div>

            <div class="grid2">

                <button id="rotateLeft">
                    Rotate Left
                </button>

                <button id="rotateRight">
                    Rotate Right
                </button>

                <button id="flipHorizontal">
                    Flip Horizontal
                </button>

                <button id="flipVertical">
                    Flip Vertical
                </button>

            </div>

        `;
    }


    if(activeTool === "export"){

        html = `

            <div class="group">

                <h3 class="group-title">
                    Export
                </h3>

                <select id="exportFormat">

                    <option value="image/jpeg">
                        JPEG
                    </option>

                    <option value="image/png">
                        PNG
                    </option>

                    <option value="image/webp">
                        WebP
                    </option>

                </select>

                <br><br>

                ${slider("quality","Quality",30,100)}

                <select id="exportSize">

                    <option value="1200">
                        1200 px
                    </option>

                    <option value="2000">
                        2000 px
                    </option>

                    <option value="3000">
                        3000 px
                    </option>

                    <option value="original">
                        Current Size
                    </option>

                </select>

                <br><br>

                <button
                    id="downloadEdited"
                    class="primary-btn"
                    style="width:100%"
                >
                    Download Edited Photo
                </button>

            </div>
        `;
    }


    $("controls").innerHTML = html;

    bindControls();
}


/* -------------------------------------------------------
   BIND CONTROLS
------------------------------------------------------- */

function bindControls(){

    $("controls")
        .querySelectorAll(
            'input[type="range"]'
        )
        .forEach(input => {

            input.addEventListener(
                "input",
                () => {

                    state[input.id] =
                        Number(input.value);

                    const output =
                        $(input.id+"Value");

                    if(output)
                        output.textContent =
                            input.value;

                    render();

                }
            );

            input.addEventListener(
                "change",
                pushHistory
            );

        });


    const colorInput =
        $("brushColor");

    if(colorInput){

        colorInput.onchange =
            event => {

                state.brushColor =
                    event.target.value;
            };
    }


    const targetClear =
        $("clearTarget");

    if(targetClear){

        targetClear.onclick = () => {

            pushHistory();

            targetColor = null;

            renderControls();

            render();

        };
    }


    const neutral =
        $("neutralColor");

    if(neutral){

        neutral.onclick = () => {

            pushHistory();

            state.temperature = 0;
            state.tint = 0;
            state.vibrance = 0;
            state.saturation = 0;

            renderControls();

            render();

        };
    }


    document
        .querySelectorAll(
            "[data-filter]"
        )
        .forEach(button => {

            button.onclick = () => {

                pushHistory();

                state.filter =
                    button.dataset.filter;

                renderControls();

                render();

            };

        });


    bindTextControls();

    bindShapeControls();

    bindCropControls();

    bindExportControls();

    bindDrawControls();

}


/* -------------------------------------------------------
   TEXT CONTROLS
------------------------------------------------------- */

function bindTextControls(){

    const font =
        $("textFont");

    if(font){

        font.onchange =
            event => {

                state.textFont =
                    event.target.value;

                if(selectedText){

                    pushHistory();

                    selectedText.font =
                        state.textFont;

                    render();

                }
            };
    }


    const color =
        $("textColor");

    if(color){

        color.onchange =
            event => {

                state.textColor =
                    event.target.value;

                if(selectedText){

                    pushHistory();

                    selectedText.color =
                        state.textColor;

                    render();

                }

            };
    }


    const background =
        $("textBackground");

    if(background){

        background.onclick = () => {

            state.textBackground =
                !state.textBackground;

            if(selectedText){

                pushHistory();

                selectedText.background =
                    state.textBackground;

                render();

            }

            renderControls();

        };
    }


    const backgroundColor =
        $("textBackgroundColor");

    if(backgroundColor){

        backgroundColor.onchange =
            event => {

                state.textBackgroundColor =
                    event.target.value;

                if(selectedText){

                    pushHistory();

                    selectedText.backgroundColor =
                        state.textBackgroundColor;

                    render();

                }

            };
    }


    const bold =
        $("textBold");

    if(bold){

        bold.onclick = () => {

            state.textBold =
                !state.textBold;

            if(selectedText){

                pushHistory();

                selectedText.bold =
                    state.textBold;

                render();

            }

            renderControls();

        };
    }


    const italic =
        $("textItalic");

    if(italic){

        italic.onclick = () => {

            state.textItalic =
                !state.textItalic;

            if(selectedText){

                pushHistory();

                selectedText.italic =
                    state.textItalic;

                render();

            }

            renderControls();

        };
    }


    const underline =
        $("textUnderline");

    if(underline){

        underline.onclick = () => {

            state.textUnderline =
                !state.textUnderline;

            if(selectedText){

                pushHistory();

                selectedText.underline =
                    state.textUnderline;

                render();

            }

            renderControls();

        };
    }


    const align =
        $("textAlign");

    if(align){

        align.onchange =
            event => {

                state.textAlign =
                    event.target.value;

                if(selectedText){

                    pushHistory();

                    selectedText.align =
                        state.textAlign;

                    render();

                }
            };
    }


    const add =
        $("addText");

    if(add){

        add.onclick = () => {

            const input =
                $("textInput");

            if(!input ||
               !input.value.trim())
                return;

            pushHistory();

            const object = {

                type:"text",

                text:
                    input.value.trim(),

                x:
                    canvas.width/2,

                y:
                    canvas.height/2,

                font:
                    state.textFont,

                size:
                    state.textSize,

                color:
                    state.textColor,

                opacity:
                    state.textOpacity,

                bold:
                    state.textBold,

                italic:
                    state.textItalic,

                underline:
                    state.textUnderline,

                align:
                    state.textAlign,

                letterSpacing:
                    state.textLetterSpacing,

                background:
                    state.textBackground,

                backgroundColor:
                    state.textBackgroundColor,

                rotation:0
            };

            objects.push(object);

            selectedText = object;

            render();

            renderControls();

            status(
                "Text added. Drag it to move."
            );
        };
    }


    const deleteText =
        $("deleteText");

    if(deleteText){

        deleteText.onclick = () => {

            if(!selectedText)
                return;

            pushHistory();

            const index =
                objects.indexOf(
                    selectedText
                );

            if(index >= 0)
                objects.splice(
                    index,
                    1
                );

            selectedText = null;

            render();

            renderControls();

        };
    }

}


/* -------------------------------------------------------
   SHAPES
------------------------------------------------------- */

function bindShapeControls(){

    const button =
        $("addShape");

    if(!button)
        return;

    button.onclick = () => {

        pushHistory();

        objects.push({

            type:"shape",

            shape:
                $("shapeType").value,

            x:
                canvas.width/2,

            y:
                canvas.height/2,

            width:
                canvas.width*.35,

            height:
                canvas.height*.2,

            radius:
                Math.min(
                    canvas.width,
                    canvas.height
                )*.15,

            color:
                $("shapeColor").value,

            lineWidth:
                Math.max(
                    2,
                    canvas.width*.004
                ),

            opacity:100,

            rotation:0
        });

        render();

        status("Shape added");

    };
}


/* -------------------------------------------------------
   DRAW CONTROLS
------------------------------------------------------- */

function bindDrawControls(){

    const clear =
        $("clearObjects");

    if(!clear)
        return;

    clear.onclick = () => {

        pushHistory();

        for(
            let i=objects.length-1;
            i>=0;
            i--
        ){

            if(
                objects[i].type === "draw"
            ){

                objects.splice(i,1);

            }
        }

        render();

    };
}


/* -------------------------------------------------------
   CROP
------------------------------------------------------- */

function bindCropControls(){

    const apply =
        $("applyCrop");

    if(!apply)
        return;

    apply.onclick = () => {

        const ratio =
            $("cropRatio").value;

        if(ratio === "Free")
            return;

        const ratios = {

            "1:1":1,
            "4:5":4/5,
            "3:4":3/4,
            "16:9":16/9,
            "9:16":9/16,
            "3:2":3/2,
            "2:3":2/3

        };

        const target =
            ratios[ratio];

        if(!target)
            return;

        pushHistory();

        let width =
            canvas.width;

        let height =
            canvas.height;

        if(width/height > target){

            width =
                Math.round(
                    height*target
                );

        }else{

            height =
                Math.round(
                    width/target
                );
        }

        const x =
            Math.round(
                (canvas.width-width)/2
            );

        const y =
            Math.round(
                (canvas.height-height)/2
            );

        const temp =
            document.createElement(
                "canvas"
            );

        temp.width = width;
        temp.height = height;

        temp
            .getContext("2d")
            .drawImage(
                canvas,
                x,
                y,
                width,
                height,
                0,
                0,
                width,
                height
            );

        sourceCanvas = temp;

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(
            sourceCanvas,
            0,
            0
        );

        originalImageData =
            ctx.getImageData(
                0,
                0,
                width,
                height
            );

        render();

        status("Crop applied");

    };


    const rotateLeft =
        $("rotateLeft");

    if(rotateLeft)
        rotateLeft.onclick =
            () => rotate(-90);


    const rotateRight =
        $("rotateRight");

    if(rotateRight)
        rotateRight.onclick =
            () => rotate(90);


    const flipH =
        $("flipHorizontal");

    if(flipH)
        flipH.onclick =
            () => flip(true,false);


    const flipV =
        $("flipVertical");

    if(flipV)
        flipV.onclick =
            () => flip(false,true);

}


function rotate(degrees){

    pushHistory();

    const temp =
        document.createElement(
            "canvas"
        );

    temp.width =
        Math.abs(
            degrees
        ) === 90
        ? canvas.height
        : canvas.width;

    temp.height =
        Math.abs(
            degrees
        ) === 90
        ? canvas.width
        : canvas.height;

    const c =
        temp.getContext("2d");

    c.translate(
        temp.width/2,
        temp.height/2
    );

    c.rotate(
        degrees*Math.PI/180
    );

    c.drawImage(
        canvas,
        -canvas.width/2,
        -canvas.height/2
    );

    sourceCanvas = temp;

    canvas.width =
        temp.width;

    canvas.height =
        temp.height;

    ctx.drawImage(
        sourceCanvas,
        0,
        0
    );

    originalImageData =
        ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        );

    render();

}


function flip(horizontal,vertical){

    pushHistory();

    const temp =
        document.createElement(
            "canvas"
        );

    temp.width =
        canvas.width;

    temp.height =
        canvas.height;

    const c =
        temp.getContext("2d");

    c.translate(
        horizontal
        ? temp.width
        : 0,
        vertical
        ? temp.height
        : 0
    );

    c.scale(
        horizontal ? -1 : 1,
        vertical ? -1 : 1
    );

    c.drawImage(
        canvas,
        0,
        0
    );

    sourceCanvas = temp;

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.drawImage(
        sourceCanvas,
        0,
        0
    );

    render();

}


/* -------------------------------------------------------
   EXPORT
------------------------------------------------------- */

function bindExportControls(){

    const format =
        $("exportFormat");

    if(format){

        format.value =
            state.format;

        format.onchange =
            event => {

                state.format =
                    event.target.value;

            };
    }


    const size =
        $("exportSize");

    if(size){

        size.onchange =
            event => {

                state.maxEdge =
                    event.target.value ===
                    "original"
                    ? null
                    : Number(
                        event.target.value
                    );

            };
    }


    const button =
        $("downloadEdited");

    if(button)
        button.onclick =
            exportImage;
}


$("exportTop").onclick =
    exportImage;


function exportImage(){

    if(!sourceCanvas)
        return;

    render();

    requestAnimationFrame(() => {

        const maxEdge =
            state.maxEdge;

        let scale = 1;

        if(maxEdge){

            scale =
                Math.min(
                    1,
                    maxEdge /
                    Math.max(
                        canvas.width,
                        canvas.height
                    )
                );
        }

        const output =
            document.createElement(
                "canvas"
            );

        output.width =
            Math.max(
                1,
                Math.round(
                    canvas.width*scale
                )
            );

        output.height =
            Math.max(
                1,
                Math.round(
                    canvas.height*scale
                )
            );

        const outputContext =
            output.getContext("2d");

        outputContext.drawImage(
            canvas,
            0,
            0,
            output.width,
            output.height
        );

        output.toBlob(
            blob => {

                if(!blob){

                    status(
                        "Export failed"
                    );

                    return;
                }

                const url =
                    URL.createObjectURL(
                        blob
                    );

                const link =
                    document.createElement(
                        "a"
                    );

                link.href = url;

                link.download =
                    "toolora-edited-photo." +
                    (
                        state.format ===
                        "image/png"
                        ? "png"
                        :
                        state.format ===
                        "image/webp"
                        ? "webp"
                        : "jpg"
                    );

                link.click();

                setTimeout(
                    () =>
                        URL.revokeObjectURL(
                            url
                        ),
                    1500
                );

                status(
                    "Export complete"
                );

            },

            state.format,

            state.quality/100
        );
    });
}


/* -------------------------------------------------------
   RESET
------------------------------------------------------- */

$("resetTool").onclick = () => {

    if(!sourceCanvas)
        return;

    pushHistory();

    const defaults = {

        exposure:0,
        contrast:0,
        highlights:0,
        shadows:0,
        whites:0,
        blacks:0,
        brightness:0,

        temperature:0,
        tint:0,
        vibrance:0,
        saturation:0,

        texture:0,
        clarity:0,
        dehaze:0,
        vignette:0,
        grain:0,

        sharpen:0,
        noise:0,

        blur:0,

        filter:"None"

    };

    Object.assign(
        state,
        defaults
    );

    renderControls();

    render();

    status(
        "Current tool reset"
    );
};


/* -------------------------------------------------------
   ZOOM
------------------------------------------------------- */

let zoom = 1;

$("zoomIn").onclick = () => {

    zoom =
        clamp(
            zoom+.1,
            .5,
            3
        );

    applyZoom();

};

$("zoomOut").onclick = () => {

    zoom =
        clamp(
            zoom-.1,
            .5,
            3
        );

    applyZoom();

};

$("fitBtn").onclick = () => {

    zoom = 1;

    applyZoom();

};

function applyZoom(){

    canvas.style.transform =
        `scale(${zoom})`;

    $("zoomText").textContent =
        Math.round(zoom*100)+"%";

}


/* -------------------------------------------------------
   KEYBOARD
------------------------------------------------------- */

document.addEventListener(
    "keydown",
    event => {

        if(
            (event.ctrlKey ||
             event.metaKey) &&
            event.key.toLowerCase() === "z"
        ){

            event.preventDefault();

            undo();

        }

        if(
            (event.ctrlKey ||
             event.metaKey) &&
            event.key.toLowerCase() === "y"
        ){

            event.preventDefault();

            redo();

        }

    }
);


/* -------------------------------------------------------
   INITIAL UI
------------------------------------------------------- */

renderControls();

updateHistoryButtons();
