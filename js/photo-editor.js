const c = document.getElementById('canvas');
const x = c.getContext('2d');

let img = null;
let history = [];
let redo = [];
let compare = false;
let draw = false;

const state = {
    brightness: 0,
    contrast: 0,
    saturation: 0
};

function save() {
    history.push(c.toDataURL());

    if (history.length > 30) {
        history.shift();
    }
}

function render() {

    if (!img) return;

    c.width = img.width;
    c.height = img.height;

    x.filter =
        `brightness(${100 + state.brightness}%)
         contrast(${100 + state.contrast}%)
         saturate(${100 + state.saturation}%)`;

    x.drawImage(img, 0, 0);

    x.filter = 'none';
}

upload.onchange = e => {

    const f = e.target.files[0];

    if (!f) return;

    const i = new Image();

    i.onload = () => {

        img = i;

        render();

        save();
    };

    i.src = URL.createObjectURL(f);
};

['brightness', 'contrast', 'saturation'].forEach(id => {

    document.getElementById(id).oninput = e => {

        state[id] = +e.target.value;

        render();
    };
});

undo.onclick = () => {

    if (history.length < 2) return;

    redo.push(history.pop());

    let i = new Image();

    i.onload = () => {

        c.width = i.width;
        c.height = i.height;

        x.drawImage(i, 0, 0);
    };

    i.src = history[history.length - 1];
};

redo.onclick = () => {

    if (!redo.length) return;

    let d = redo.pop();

    history.push(d);

    let i = new Image();

    i.onload = () => x.drawImage(i, 0, 0);

    i.src = d;
};

compare.onclick = () => {

    if (!img) return;

    if (compare) {

        render();

        compare = false;

    } else {

        x.clearRect(0, 0, c.width, c.height);

        x.drawImage(img, 0, 0);

        compare = true;
    }
};

download.onclick = () => {

    const a = document.createElement('a');

    a.href = c.toDataURL('image/png');

    a.download = 'toolora.png';

    a.click();
};

drawTool.onclick = () => draw = !draw;

let p = false;

c.onpointerdown = e => {

    if (!draw) return;

    p = true;

    x.beginPath();

    x.moveTo(e.offsetX, e.offsetY);
};

c.onpointermove = e => {

    if (p && draw) {

        x.lineTo(e.offsetX, e.offsetY);

        x.stroke();
    }
};

window.onpointerup = () => {

    if (p) {

        p = false;

        save();
    }
};

textTool.onclick = () => {

    const t = prompt('Text');

    if (!t) return;

    x.fillStyle = 'white';

    x.font = '40px sans-serif';

    x.fillText(t, 50, 50);

    save();
};
