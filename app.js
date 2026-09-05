
/* =========================================================
   REAL STAR / SHOOTING STAR SYSTEM
   FROM FIRST UI
========================================================= */

const canvas =
    document.getElementById(
        "space-canvas"
    );

const ctx =
    canvas.getContext(
        "2d"
    );


function resizeCanvas(){

    canvas.width =
        window.innerWidth;

    canvas.height =
        window.innerHeight;
}

resizeCanvas();

window.addEventListener(
    "resize",
    resizeCanvas
);


/* =========================================================
   TWINKLING STARS
========================================================= */

const stars = [];

const numStars = 150;


for(
    let i = 0;
    i < numStars;
    i++
){

    stars.push({

        x:
            Math.random() *
            canvas.width,

        y:
            Math.random() *
            canvas.height,

        radius:
            Math.random() *
            1.5,

        alpha:
            Math.random(),

        speed:
            Math.random() *
            .02 +
            .005
    });
}


/* =========================================================
   SHOOTING STARS
========================================================= */

let shootingStars = [];

let particles = [];


function addShootingStar(){

    shootingStars.push({

        x:
            Math.random() *
            canvas.width,

        y:0,

        length:
            Math.random() *
            80 +
            40,

        speed:
            Math.random() *
            6 +
            4,

        angle:
            Math.PI / 4,

        alpha:1
    });
}


setInterval(
    () => {

        if(
            Math.random() > .4
        ){

            addShootingStar();
        }

    },
    2000
);


/* =========================================================
   STAR ANIMATION
========================================================= */

function animateStars(){

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


    /*
       Twinkling stars
    */

    stars.forEach(
        star => {

            star.alpha +=
                star.speed;


            if(
                star.alpha > 1 ||
                star.alpha < .2
            ){

                star.speed =
                    -star.speed;
            }


            ctx.beginPath();

            ctx.arc(
                star.x,
                star.y,
                star.radius,
                0,
                Math.PI * 2
            );


            ctx.fillStyle =
                `rgba(
                    255,
                    255,
                    255,
                    ${Math.abs(
                        star.alpha
                    )}
                )`;


            ctx.fill();
        }
    );


    /*
       Shooting stars
    */

    for(
        let i =
            shootingStars.length - 1;

        i >= 0;

        i--
    ){

        const ss =
            shootingStars[i];


        const tailX =
            ss.x -
            Math.cos(
                ss.angle
            ) *
            ss.length;


        const tailY =
            ss.y -
            Math.sin(
                ss.angle
            ) *
            ss.length;


        const gradient =
            ctx.createLinearGradient(
                ss.x,
                ss.y,
                tailX,
                tailY
            );


        gradient.addColorStop(
            0,
            "rgba(255,255,255,1)"
        );


        gradient.addColorStop(
            1,
            "rgba(255,190,152,0)"
        );


        ctx.beginPath();

        ctx.moveTo(
            ss.x,
            ss.y
        );

        ctx.lineTo(
            tailX,
            tailY
        );


        ctx.strokeStyle =
            gradient;

        ctx.lineWidth =
            2;

        ctx.stroke();


        ss.x +=
            Math.cos(
                ss.angle
            ) *
            ss.speed;


        ss.y +=
            Math.sin(
                ss.angle
            ) *
            ss.speed;


        /*
           Blast
        */

        if(
            ss.y >
                canvas.height * .8 ||
            ss.x >
                canvas.width
        ){

            for(
                let p = 0;
                p < 25;
                p++
            ){

                particles.push({

                    x:ss.x,

                    y:ss.y,

                    vx:
                        (
                            Math.random() -
                            .5
                        ) * 6,

                    vy:
                        (
                            Math.random() -
                            .5
                        ) * 6,

                    radius:
                        Math.random() * 2,

                    alpha:1,

                    decay:
                        Math.random() *
                        .03 +
                        .015,

                    color:
                        Math.random() > .5
                            ? "#ffbe98"
                            : "#ffb6c1"
                });
            }


            shootingStars.splice(
                i,
                1
            );
        }
    }


    /*
       Blast particles
    */

    for(
        let i =
            particles.length - 1;

        i >= 0;

        i--
    ){

        const pt =
            particles[i];


        pt.x +=
            pt.vx;

        pt.y +=
            pt.vy;

        pt.alpha -=
            pt.decay;


        if(
            pt.alpha <= 0
        ){

            particles.splice(
                i,
                1
            );

            continue;
        }


        ctx.beginPath();

        ctx.arc(
            pt.x,
            pt.y,
            pt.radius,
            0,
            Math.PI * 2
        );


        ctx.fillStyle =
            pt.color;

        ctx.globalAlpha =
            pt.alpha;

        ctx.fill();

        ctx.globalAlpha =
            1;
    }


    requestAnimationFrame(
        animateStars
    );
}


animateStars();


/* =========================================================
   ORIGINAL APPLICATION JAVASCRIPT
   STARTING FROM YOUR EXISTING CODE
========================================================= */

const intro =
    document.getElementById(
        "introScreen"
    );

const loginWrap =
    document.getElementById(
        "loginWrap"
    );

const dashboard =
    document.getElementById(
        "dashboard"
    );

const password =
    document.getElementById(
        "password"
    );

const loginButton =
    document.getElementById(
        "loginButton"
    );

const loginError =
    document.getElementById(
        "loginError"
    );

const logoutButton =
    document.getElementById(
        "logoutButton"
    );

const fileInput =
    document.getElementById(
        "fileInput"
    );

const fileList =
    document.getElementById(
        "fileList"
    );

const uploadQueue =
    document.getElementById(
        "uploadQueue"
    );

const storageNumber =
    document.getElementById(
        "storageNumber"
    );

const storagePercent =
    document.getElementById(
        "storagePercent"
    );

const storageBar =
    document.getElementById(
        "storageBar"
    );

const storageUsed =
    document.getElementById(
        "storageUsed"
    );

const storageRemaining =
    document.getElementById(
        "storageRemaining"
    );

const storageProviderGrid =
    document.getElementById(
        "storageProviderGrid"
    );

const storageDetailsRefresh =
    document.getElementById(
        "storageDetailsRefresh"
    );

const downloadAllButton =
    document.getElementById(
        "downloadAllButton"
    );

const searchInput =
    document.getElementById(
        "searchInput"
    );

const sortSelect =
    document.getElementById(
        "sortSelect"
    );

const filesCount =
    document.getElementById(
        "filesCount"
    );

const toast =
    document.getElementById(
        "toast"
    );


/* =========================================================
   QR
========================================================= */

const qrButton =
    document.getElementById(
        "qrButton"
    );

const qrModal =
    document.getElementById(
        "qrModal"
    );

const qrClose =
    document.getElementById(
        "qrClose"
    );

const qrCode =
    document.getElementById(
        "qrCode"
    );


/* =========================================================
   APP STATE
========================================================= */

let allFiles = [];

let activeTab = "all";

let currentView = "grid";

let toastTimer = null;


/* =========================================================
   SAFE STORAGE
========================================================= */

const STAR_KEY =
    "personal-cloud-starred";

const RECENT_KEY =
    "personal-cloud-recent";

const VIEW_KEY =
    "personal-cloud-view";


function readJSON(
    key,
    fallback
){

    try{

        const value =
            localStorage.getItem(
                key
            );

        return value
            ? JSON.parse(value)
            : fallback;

    }catch(_){

        return fallback;
    }
}


function writeJSON(
    key,
    value
){

    try{

        localStorage.setItem(
            key,
            JSON.stringify(value)
        );

    }catch(_){}
}


let starred =
    new Set(
        readJSON(
            STAR_KEY,
            []
        )
    );


let recent =
    readJSON(
        RECENT_KEY,
        []
    );


currentView =
    localStorage.getItem(
        VIEW_KEY
    ) || "grid";


if(
    currentView === "list"
){

    fileList.classList.add(
        "listView"
    );

    document
        .getElementById(
            "listView"
        )
        .classList.add(
            "active"
        );

    document
        .getElementById(
            "gridView"
        )
        .classList.remove(
            "active"
        );
}


/* =========================================================
   AUDIO
========================================================= */

let audioContext = null;


function getAudioContext(){

    if(!audioContext){

        const AudioCtx =
            window.AudioContext ||
            window.webkitAudioContext;

        if(AudioCtx){

            audioContext =
                new AudioCtx();
        }
    }

    return audioContext;
}


function tapSound(
    frequency = 620
){

    try{

        const ac =
            getAudioContext();

        if(!ac){
            return;
        }

        if(
            ac.state ===
            "suspended"
        ){

            ac.resume();
        }

        const oscillator =
            ac.createOscillator();

        const gain =
            ac.createGain();

        oscillator.type =
            "sine";

        oscillator.frequency.value =
            frequency;

        gain.gain.setValueAtTime(
            .0001,
            ac.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            .035,
            ac.currentTime + .008
        );

        gain.gain.exponentialRampToValueAtTime(
            .0001,
            ac.currentTime + .075
        );

        oscillator.connect(
            gain
        );

        gain.connect(
            ac.destination
        );

        oscillator.start();

        oscillator.stop(
            ac.currentTime + .08
        );

    }catch(_){}
}


/* =========================================================
   WELCOME VOICE
========================================================= */

function welcomeVoice(){

    try{

        if(
            !("speechSynthesis" in window)
        ){
            return;
        }

        const utterance =
            new SpeechSynthesisUtterance(
                "Welcome to Cloud-Zen"
            );

        utterance.rate =
            .88;

        utterance.pitch =
            1.02;

        utterance.volume =
            .65;

        window.speechSynthesis.cancel();

        window.speechSynthesis.speak(
            utterance
        );

    }catch(_){}
}


/* =========================================================
   BUTTON SOUND
========================================================= */

document.addEventListener(
    "click",
    event => {

        const target =
            event.target.closest(
                "button,.uploadButton,.cloudTab"
            );

        if(target){

            tapSound(
                target.classList.contains(
                    "delete"
                )
                    ? 390
                    : 620
            );
        }
    }
);


/* =========================================================
   TOAST
========================================================= */

function showToast(
    message
){

    clearTimeout(
        toastTimer
    );

    toast.textContent =
        message;

    toast.classList.add(
        "show"
    );

    toastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            2200
        );
}


/* =========================================================
   AUTH API
========================================================= */

async function authApi(
    url,
    options = {}
){

    const response =
        await fetch(
            url,
            {
                credentials:
                    "same-origin",

                ...options
            }
        );


    let data = null;


    try{

        data =
            await response.json();

    }catch(_){}


    if(
        response.status === 401
    ){

        showLogin();

        throw new Error(
            "Authentication required"
        );
    }


    if(
        !response.ok
    ){

        throw new Error(
            data?.error ||
            "Request failed"
        );
    }


    return data;
}


/* =========================================================
   API
========================================================= */

async function api(
    url,
    options = {}
){

    return await authApi(
        url,
        options
    );
}


/* =========================================================
   LOGIN SCREEN
========================================================= */

function showLogin(){

    loginWrap.classList.add(
        "show"
    );

    dashboard.classList.remove(
        "show"
    );

    setTimeout(
        () => {

            password.focus();

        },
        100
    );
}


function hideLogin(){

    loginWrap.classList.remove(
        "show"
    );
}


/* =========================================================
   DASHBOARD
========================================================= */

async function showDashboard(){

    hideLogin();

    dashboard.classList.add(
        "show"
    );

    await loadEverything();
}


/* =========================================================
   SESSION
========================================================= */

async function checkAuthentication(){

    try{

        const result =
            await authApi(
                "/api/auth/me"
            );


        if(
            result &&
            result.authenticated
        ){

            await showDashboard();

            return true;
        }


        showLogin();

        return false;

    }catch(_){

        showLogin();

        return false;
    }
}


async function checkLogin(){

    return await checkAuthentication();
}


/* =========================================================
   LOGIN
========================================================= */

async function login(){

    const value =
        password.value;


    loginError.textContent =
        "";


    if(!value){

        loginError.textContent =
            "Please enter your password.";

        password.focus();

        return;
    }


    loginButton.disabled =
        true;

    loginButton.textContent =
        "Unlocking...";


    try{

        await authApi(
            "/api/auth/login",
            {

                method:"POST",

                headers:{
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        password:value
                    })
            }
        );


        password.value =
            "";


        hideLogin();

        dashboard.classList.add(
            "show"
        );


        if(
            typeof loadEverything ===
            "function"
        ){

            await loadEverything();

        }else if(
            typeof initApp ===
            "function"
        ){

            await initApp();

        }else if(
            typeof startApp ===
            "function"
        ){

            await startApp();
        }

    }catch(error){

        loginError.textContent =
            error.message;

    }finally{

        loginButton.disabled =
            false;

        loginButton.textContent =
            "Enter Website";
    }
}


/* =========================================================
   LOGIN BUTTON
========================================================= */

loginButton.addEventListener(
    "click",
    login
);


/* =========================================================
   ENTER KEY
========================================================= */

password.addEventListener(
    "keydown",
    event => {

        if(
            event.key ===
            "Enter"
        ){

            event.preventDefault();

            login();
        }
    }
);


/* =========================================================
   LOGOUT
========================================================= */

async function logout(){

    try{

        await authApi(
            "/api/auth/logout",
            {
                method:"POST"
            }
        );

    }catch(error){

        console.error(
            error
        );

    }finally{

        showLogin();

        password.value =
            "";

        loginError.textContent =
            "";
    }
}


logoutButton.addEventListener(
    "click",
    logout
);


window.cloudLogout =
    logout;


/* =========================================================
   STORAGE
========================================================= */

async function loadStorage(){

    const data =
        await api(
            "/api/storage"
        );


    storageNumber.textContent =
        `${data.usedText} / ${data.limitText}`;


    storagePercent.textContent =
        `${data.usedPercent}%`;


    storageBar.style.width =
        `${Math.min(
            100,
            Number(
                data.usedPercent
            ) || 0
        )}%`;


    storageUsed.textContent =
        `Used: ${data.usedText}`;


    storageRemaining.textContent =
        `Free: ${data.remainingText}`;


    renderStorageProviders(data);
}


function renderStorageProviders(data){

    if(!storageProviderGrid){
        return;
    }


    const providers = [
        {
            key:"cloud",
            name:"Cloud Storage",
            data:data.provider || {}
        }
    ];


    storageProviderGrid.innerHTML = "";


    providers.forEach(provider => {

        const item =
            document.createElement("div");

        item.className =
            "storageProvider";


        const configured =
            provider.data.configured !== false;

        const connected =
            provider.data.connected !== false;

        const used =
            Number(
                provider.data.usedBytes ??
                provider.data.totalBytes ??
                0
            );

        const capacity =
            Number(
                provider.data.capacityBytes ??
                provider.data.limitBytes ??
                0
            );

        const remaining =
            Number(
                provider.data.remainingBytes ??
                Math.max(0, capacity - used)
            );

        const percent =
            capacity > 0
                ? Math.min(
                    100,
                    (used / capacity) * 100
                )
                : 0;

        const safePercent =
            Number(percent.toFixed(2));

        let statusText = "Connected";
        let statusClass = "";

        if(!configured){
            statusText = "Not configured";
            statusClass = "unconfigured";
        }else if(!connected){
            statusText = "Not connected";
            statusClass = "offline";
        }else if(safePercent >= 99.5){
            statusText = "Near storage limit";
            statusClass = "offline";
        }


        item.innerHTML = `
            <div class="storageProviderTop">
                <div class="storageProviderName">
                    ${escapeHtml(provider.name)}
                </div>
                <div class="storageProviderPercent">
                    ${configured ? safePercent : 0}%
                </div>
            </div>

            <div class="storageProviderBar">
                <div
                    class="storageProviderFill"
                    style="width:${configured ? safePercent : 0}%"
                ></div>
            </div>

            <div class="storageProviderMeta">
                <span>Used: ${escapeHtml(
                    provider.data.usedText ||
                    formatClientBytes(used)
                )}</span>
                <span>Free: ${escapeHtml(
                    provider.data.remainingText ||
                    formatClientBytes(remaining)
                )}</span>
            </div>

            <div class="storageProviderStatus ${statusClass}">
                ${escapeHtml(statusText)}
            </div>
        `;

        storageProviderGrid.appendChild(item);
    });
}


function formatClientBytes(bytes){

    const value = Number(bytes) || 0;

    if(value <= 0){
        return "0 B";
    }

    const units = ["B","KB","MB","GB","TB"];

    const index = Math.min(
        units.length - 1,
        Math.floor(
            Math.log(value) /
            Math.log(1024)
        )
    );

    return `${(
        value /
        Math.pow(1024,index)
    ).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}



storageDetailsRefresh?.addEventListener(
    "click",
    async () => {
        try{
            storageDetailsRefresh.disabled = true;
            storageDetailsRefresh.textContent = "Loading...";
            await loadStorage();
        }catch(error){
            console.error(error);
            showToast(
                error.message ||
                "Could not refresh storage"
            );
        }finally{
            storageDetailsRefresh.disabled = false;
            storageDetailsRefresh.textContent = "Refresh";
        }
    }
);


downloadAllButton?.addEventListener(
    "click",
    async () => {
        try{
            const unlocked = await ensureDownloadAccess();
            if(!unlocked) return;
        }catch(error){
            showToast(error.message || "Download security check failed");
            return;
        }

        const confirmed =
            window.confirm(
                "Download all files as one ZIP? This can be very large and may take time."
            );

        if(!confirmed){
            return;
        }

        const a =
            document.createElement("a");

        a.href =
            "/api/download-all";

        a.download =
            "cloud-zen-all-files.zip";

        document.body.appendChild(a);
        a.click();
        a.remove();
    }
);



/* =========================================================
   FILES
========================================================= */

async function loadFiles(){

    fileList.innerHTML =
        `
        <div class="empty">
            <div class="emptyIcon">☁</div>
            Loading your cloud...
        </div>
        `;


    try{

        const files =
            await api(
                "/api/files"
            );


        allFiles =
            Array.isArray(files)
                ? files
                : [];


        renderFiles();

    }catch(error){

        fileList.innerHTML =
            `
            <div class="empty">
                <div class="emptyIcon">⚠</div>
                ${escapeHtml(
                    error.message
                )}
            </div>
            `;
    }
}


/* =========================================================
   FILE KEY
========================================================= */

function fileKey(file){

    return String(
        file.name || ""
    );
}


/* =========================================================
   FILTER
========================================================= */

function filteredFiles(){

    let files =
        [...allFiles];


    if(
        activeTab ===
        "starred"
    ){

        files =
            files.filter(
                file =>
                    starred.has(
                        fileKey(file)
                    )
            );
    }


    if(
        activeTab ===
        "recent"
    ){

        const positions =
            new Map(
                recent.map(
                    (name,index) =>
                        [name,index]
                )
            );

        files =
            files.filter(
                file =>
                    positions.has(
                        fileKey(file)
                    )
            );

        files.sort(
            (a,b) =>
                positions.get(
                    fileKey(a)
                ) -
                positions.get(
                    fileKey(b)
                )
        );
    }


    if(
        activeTab ===
        "video"
    ){

        files =
            files.filter(
                file =>
                    String(
                        file.type || ""
                    )
                    .toLowerCase()
                    .startsWith(
                        "video/"
                    )
            );
    }


    if(
        activeTab ===
        "image"
    ){

        files =
            files.filter(
                file =>
                    String(
                        file.type || ""
                    )
                    .toLowerCase()
                    .startsWith(
                        "image/"
                    )
            );
    }


    if(
        activeTab ===
        "audio"
    ){

        files =
            files.filter(
                file =>
                    String(
                        file.type || ""
                    )
                    .toLowerCase()
                    .startsWith(
                        "audio/"
                    )
            );
    }


    if(
        activeTab ===
        "document"
    ){

        files =
            files.filter(
                file => {

                    const type =
                        String(
                            file.type || ""
                        )
                        .toLowerCase();

                    const name =
                        String(
                            file.name || ""
                        )
                        .toLowerCase();


                    return (

                        type ===
                            "application/pdf" ||

                        type.includes(
                            "document"
                        ) ||

                        type.includes(
                            "word"
                        ) ||

                        type.includes(
                            "spreadsheet"
                        ) ||

                        type.includes(
                            "excel"
                        ) ||

                        type.includes(
                            "presentation"
                        ) ||

                        type.startsWith(
                            "text/"
                        ) ||

                        /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|rtf|odt)$/i
                            .test(
                                name
                            )
                    );
                }
            );
    }


    if(
        activeTab ===
        "file"
    ){

        files =
            files.filter(
                file => {

                    const type =
                        String(
                            file.type || ""
                        )
                        .toLowerCase();


                    return (

                        !type.startsWith(
                            "image/"
                        ) &&

                        !type.startsWith(
                            "video/"
                        ) &&

                        !type.startsWith(
                            "audio/"
                        )
                    );
                }
            );
    }


    const query =
        searchInput.value
            .trim()
            .toLowerCase();


    if(query){

        files =
            files.filter(
                file =>
                    String(
                        file.name || ""
                    )
                    .toLowerCase()
                    .includes(
                        query
                    )
            );
    }


    if(
        activeTab !==
        "recent"
    ){

        const sort =
            sortSelect.value;


        files.sort(
            (a,b) => {

                if(
                    sort ===
                    "name"
                ){

                    return String(
                        a.name || ""
                    ).localeCompare(
                        String(
                            b.name || ""
                        )
                    );
                }


                if(
                    sort ===
                    "size"
                ){

                    return (
                        Number(
                            a.size || 0
                        ) -
                        Number(
                            b.size || 0
                        )
                    );
                }


                if(
                    sort ===
                    "date"
                ){

                    return (
                        new Date(
                            b.modified ||
                            0
                        ) -
                        new Date(
                            a.modified ||
                            0
                        )
                    );
                }


                if(
                    sort ===
                    "type"
                ){

                    return String(
                        a.type || ""
                    ).localeCompare(
                        String(
                            b.type || ""
                        )
                    );
                }


                return 0;
            }
        );
    }


    return files;
}


/* =========================================================
   RENDER FILES
========================================================= */

function renderFiles(){

    const files =
        filteredFiles();


    filesCount.textContent =
        `${files.length} ${
            files.length === 1
                ? "file"
                : "files"
        }`;


    if(
        !files.length
    ){

        let message =
            "No files found.";


        if(
            activeTab ===
            "starred"
        )
            message =
                "No starred files yet.";


        if(
            activeTab ===
            "recent"
        )
            message =
                "No recent files yet.";


        if(
            activeTab ===
            "video"
        )
            message =
                "No videos found.";


        if(
            activeTab ===
            "image"
        )
            message =
                "No images found.";


        if(
            activeTab ===
            "audio"
        )
            message =
                "No audio files found.";


        if(
            activeTab ===
            "document"
        )
            message =
                "No documents found.";


        if(
            activeTab ===
            "file"
        )
            message =
                "No other files found.";


        fileList.innerHTML =
            `
            <div class="empty">
                <div class="emptyIcon">☁</div>
                ${message}
            </div>
            `;

        return;
    }


    fileList.innerHTML =
        "";


    for(
        const file of files
    ){

        fileList.appendChild(
            createFileCard(
                file
            )
        );
    }
}


/* =========================================================
   FILE CARD
========================================================= */

function createFileCard(
    file
){

    const card =
        document.createElement(
            "article"
        );

    card.className =
        "fileCard";


    const preview =
        document.createElement(
            "div"
        );

    preview.className =
        "preview";


    const type =
        String(
            file.type || ""
        );


    const badge =
        document.createElement(
            "div"
        );

    badge.className =
        "fileTypeBadge";

    badge.textContent =
        typeLabel(type);


    const star =
        document.createElement(
            "button"
        );

    star.className =
        "starButton";

    star.innerHTML =
        starred.has(
            fileKey(file)
        )
            ? "★"
            : "☆";


    if(
        starred.has(
            fileKey(file)
        )
    ){

        star.classList.add(
            "starred"
        );
    }


    star.title =
        "Star file";


    star.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            toggleStar(
                file
            );
        }
    );


    preview.append(
        badge,
        star
    );


    {
        const icon =
            document.createElement(
                "div"
            );

        icon.className =
            "fileIcon";

        icon.textContent =
            iconFor(type);

        preview.appendChild(icon);
    }


    const info =
        document.createElement(
            "div"
        );

    info.className =
        "fileInfo";


    const name =
        document.createElement(
            "p"
        );

    name.className =
        "fileName";

    name.textContent =
        file.name;


    const meta =
        document.createElement(
            "div"
        );

    meta.className =
        "fileMeta";


    const size =
        document.createElement(
            "span"
        );

    size.textContent =
        file.sizeText ||
        formatBytes(
            file.size
        );


    const date =
        document.createElement(
            "span"
        );

    date.textContent =
        file.modified
            ? new Date(
                file.modified
            ).toLocaleDateString()
            : "";


    meta.append(
        size,
        date
    );


    const actions =
        document.createElement(
            "div"
        );

    actions.className =
        "fileActions";


    const open =
        document.createElement(
            "button"
        );

    open.className =
        "fileAction";

    open.textContent =
        canPreview(type)
            ? "Open"
            : "Info";


    open.addEventListener(
        "click",
        () => {

            rememberRecent(
                file.name
            );

            if(
                canPreview(type)
            ){

                openViewer(
                    file
                );

            }else{

                downloadFile(
                    file.name
                );
            }
        }
    );


    const download =
        document.createElement(
            "button"
        );

    download.className =
        "fileAction";

    download.textContent =
        "Download";


    download.addEventListener(
        "click",
        () => {

            rememberRecent(
                file.name
            );

            downloadFile(
                file.name
            );
        }
    );


    const share =
        document.createElement(
            "button"
        );

    share.className =
        "fileAction";

    share.textContent =
        "Share";


    share.addEventListener(
        "click",
        () => {

            rememberRecent(
                file.name
            );

            shareFile(
                file
            );
        }
    );


    const del =
        document.createElement(
            "button"
        );

    del.className =
        "fileAction delete";

    del.textContent =
        "Delete";


    del.addEventListener(
        "click",
        () =>
            deleteFile(
                file.name
            )
    );


    actions.append(
        open,
        download,
        share
    );


    const deleteRow =
        document.createElement(
            "div"
        );

    deleteRow.style.marginTop =
        "7px";

    deleteRow.style.display =
        "flex";


    deleteRow.appendChild(
        del
    );


    del.style.width =
        "100%";


    info.append(
        name,
        meta,
        actions,
        deleteRow
    );


    card.append(
        preview,
        info
    );


    return card;
}


/* =========================================================
   STAR
========================================================= */

function toggleStar(
    file
){

    const key =
        fileKey(file);


    if(
        starred.has(key)
    ){

        starred.delete(key);

        showToast(
            "Removed from Starred"
        );

    }else{

        starred.add(key);

        showToast(
            "Added to Starred"
        );
    }


    writeJSON(
        STAR_KEY,
        [...starred]
    );


    renderFiles();
}


/* =========================================================
   RECENT
========================================================= */

function rememberRecent(
    name
){

    recent =
        recent.filter(
            item =>
                item !== name
        );


    recent.unshift(
        name
    );


    recent =
        recent.slice(
            0,
            50
        );


    writeJSON(
        RECENT_KEY,
        recent
    );
}


/* =========================================================
   SHARE
========================================================= */

async function shareFile(
    file
){

    const url =
        new URL(
            streamUrl(
                file.name
            ),
            window.location.origin
        ).href;


    if(
        navigator.share
    ){

        try{

            await navigator.share({

                title:
                    file.name,

                text:
                    `Shared from Cloud-Zen: ${file.name}`,

                url
            });

            return;

        }catch(error){

            if(
                error?.name ===
                "AbortError"
            ){

                return;
            }
        }
    }


    try{

        await navigator.clipboard.writeText(
            url
        );

        showToast(
            "File link copied"
        );

    }catch(_){

        prompt(
            "Copy this file link:",
            url
        );
    }
}


/* =========================================================
   PREVIEW
========================================================= */

function canPreview(
    type
){

    return (

        type.startsWith(
            "image/"
        ) ||

        type.startsWith(
            "video/"
        ) ||

        type ===
            "application/pdf" ||

        type.startsWith(
            "audio/"
        )
    );
}


function iconFor(
    type
){

    if(
        type.startsWith(
            "video/"
        )
    )
        return "🎬";


    if(
        type.startsWith(
            "audio/"
        )
    )
        return "🎵";


    if(
        type.startsWith(
            "image/"
        )
    )
        return "🖼️";


    if(
        type ===
        "application/pdf"
    )
        return "📕";


    if(
        type.includes(
            "word"
        ) ||
        type.includes(
            "document"
        )
    )
        return "📄";


    if(
        type.includes(
            "spreadsheet"
        ) ||
        type.includes(
            "excel"
        )
    )
        return "📊";


    if(
        type.includes(
            "presentation"
        )
    )
        return "📽️";


    if(
        type.includes(
            "zip"
        ) ||
        type.includes(
            "compressed"
        )
    )
        return "🗜️";


    if(
        type.startsWith(
            "text/"
        )
    )
        return "📝";


    return "📦";
}


function typeLabel(
    type
){

    if(
        type.startsWith(
            "image/"
        )
    )
        return "IMAGE";


    if(
        type.startsWith(
            "video/"
        )
    )
        return "VIDEO";


    if(
        type.startsWith(
            "audio/"
        )
    )
        return "AUDIO";


    if(
        type ===
        "application/pdf"
    )
        return "PDF";


    if(
        type.includes(
            "word"
        ) ||
        type.includes(
            "document"
        )
    )
        return "DOC";


    if(
        type.includes(
            "spreadsheet"
        ) ||
        type.includes(
            "excel"
        )
    )
        return "SHEET";


    if(
        type.includes(
            "presentation"
        )
    )
        return "SLIDE";


    return "FILE";
}


/* =========================================================
   STREAM / DOWNLOAD
========================================================= */

function streamUrl(
    name
){

    return (
        "/api/stream/" +
        name
            .split("/")
            .map(
                encodeURIComponent
            )
            .join("/")
    );
}


function downloadUrl(
    name
){

    return (
        "/api/download/" +
        name
            .split("/")
            .map(
                encodeURIComponent
            )
            .join("/")
    );
}


async function downloadFile(
    name
){

    const unlocked = await ensureDownloadAccess();
    if(!unlocked){
        return;
    }

    const a =
        document.createElement(
            "a"
        );


    a.href =
        downloadUrl(
            name
        );


    a.download =
        name
            .split("/")
            .pop();


    document.body.appendChild(
        a
    );


    a.click();

    a.remove();
}


/* =========================================================
   VIEWER
========================================================= */

const viewer =
    document.getElementById(
        "viewer"
    );

const viewerTitle =
    document.getElementById(
        "viewerTitle"
    );

const viewerContent =
    document.getElementById(
        "viewerContent"
    );


document
    .getElementById(
        "closeViewer"
    )
    .addEventListener(
        "click",
        closeViewer
    );


viewer.addEventListener(
    "click",
    event => {

        if(
            event.target ===
            viewer
        ){

            closeViewer();
        }
    }
);


async function openViewer(
    file
){

    const unlocked = await ensureDownloadAccess();
    if(!unlocked){
        return;
    }

    viewerTitle.textContent =
        file.name;


    viewerContent.innerHTML =
        "";


    const type =
        String(
            file.type || ""
        );


    const url =
        streamUrl(
            file.name
        );


    if(
        type.startsWith(
            "image/"
        )
    ){

        const img =
            document.createElement(
                "img"
            );

        img.src =
            url;

        img.alt =
            file.name;

        viewerContent.appendChild(
            img
        );

    }else if(
        type.startsWith(
            "video/"
        )
    ){

        const video =
            document.createElement(
                "video"
            );

        video.src =
            url;

        video.controls =
            true;

        video.autoplay =
            false;

        video.playsInline =
            true;

        viewerContent.appendChild(
            video
        );

    }else if(
        type.startsWith(
            "audio/"
        )
    ){

        const audio =
            document.createElement(
                "audio"
            );

        audio.src =
            url;

        audio.controls =
            true;

        viewerContent.appendChild(
            audio
        );

    }else if(
        type ===
        "application/pdf"
    ){

        const iframe =
            document.createElement(
                "iframe"
            );

        iframe.src =
            url;

        viewerContent.appendChild(
            iframe
        );
    }


    viewer.classList.add(
        "show"
    );
}


function closeViewer(){

    viewer.classList.remove(
        "show"
    );

    viewerContent.innerHTML =
        "";
}


/* =========================================================
   DELETE
========================================================= */

async function deleteFile(
    name
){

    const ok =
        confirm(
            `Delete "${name}" permanently?`
        );


    if(!ok){
        return;
    }


    try{

        await api(
            "/api/files",
            {

                method:"DELETE",

                headers:{
                    "Content-Type":
                        "application/json"
                },

                body:
                    JSON.stringify({
                        name
                    })
            }
        );


        starred.delete(
            name
        );


        writeJSON(
            STAR_KEY,
            [...starred]
        );


        recent =
            recent.filter(
                item =>
                    item !== name
            );


        writeJSON(
            RECENT_KEY,
            recent
        );


        showToast(
            "File deleted"
        );


        await loadEverything();

    }catch(error){

        alert(
            error.message
        );
    }
}


/* =========================================================
   UPLOAD INPUT
========================================================= */

fileInput.addEventListener(
    "change",
    async event => {

        const files =
            Array.from(
                event.target.files
            );


        if(
            !files.length
        ){
            return;
        }


        await uploadFiles(
            files
        );


        fileInput.value =
            "";


        await loadEverything();
    }
);


/* =========================================================
   DRAG DROP
========================================================= */

const uploadCard =
    document.getElementById(
        "uploadCard"
    );


[
    "dragenter",
    "dragover"
].forEach(
    eventName => {

        uploadCard.addEventListener(
            eventName,
            event => {

                event.preventDefault();

                uploadCard.classList.add(
                    "dragging"
                );
            }
        );
    }
);


[
    "dragleave",
    "drop"
].forEach(
    eventName => {

        uploadCard.addEventListener(
            eventName,
            event => {

                event.preventDefault();

                uploadCard.classList.remove(
                    "dragging"
                );
            }
        );
    }
);


uploadCard.addEventListener(
    "drop",
    async event => {

        const files =
            Array.from(
                event.dataTransfer.files
            );


        if(
            !files.length
        ){
            return;
        }


        await uploadFiles(
            files
        );


        await loadEverything();
    }
);


/* =========================================================
   ACTION ACCESS — SECOND/THIRD SECURITY LAYER
========================================================= */

async function unlockAction(kind){
    if(kind !== "download"){
        return true;
    }

    const key = "cloud_zen_download_unlocked";
    const stampKey = `${key}_at`;
    const cached = sessionStorage.getItem(key) === "1";
    const cachedAt = Number(sessionStorage.getItem(stampKey) || 0);
    const cacheValid = cached && cachedAt > 0 && (Date.now() - cachedAt) < (14 * 60 * 1000);

    if(cacheValid) return true;

    sessionStorage.removeItem(key);
    sessionStorage.removeItem(stampKey);

    const value = window.prompt("Enter Download / view password:");
    if(value === null) return false;

    const response = await fetch("/api/access/download", {
        method:"POST",
        credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({password:String(value).trim()})
    });

    let data = null;
    try{ data = await response.json(); }catch(_){}

    if(!response.ok){
        throw new Error(data?.error || "Security check failed");
    }

    sessionStorage.setItem(key, "1");
    sessionStorage.setItem(stampKey, String(Date.now()));
    return true;
}

async function ensureDownloadAccess(){
    return await unlockAction("download");
}

/* =========================================================
   MULTI UPLOAD
========================================================= */

async function uploadFiles(
    files
){

    for(
        const file of files
    ){

        try{

            await uploadFile(
                file
            );

        }catch(error){

            console.error(
                error
            );

            alert(
                `${file.name}: ${error.message}`
            );
        }
    }
}


/* =========================================================
   CHUNK UPLOAD
========================================================= */

const CHUNK_SIZE =
    64 * 1024 * 1024;


async function uploadFile(
    file
){

    const total =
        Math.ceil(
            file.size /
            CHUNK_SIZE
        );


    const id =
        cryptoRandomId();


    const queue =
        createQueueItem(
            file
        );


    let uploaded =
        0;


    for(
        let index = 0;
        index < total;
        index++
    ){

        const start =
            index *
            CHUNK_SIZE;


        const end =
            Math.min(
                file.size,
                start +
                CHUNK_SIZE
            );


        const blob =
            file.slice(
                start,
                end
            );


        const params =
            new URLSearchParams({

                id,

                index:
                    String(index),

                total:
                    String(total),

                size:
                    String(file.size),

                name:
                    file.name,

                relativePath:
                    file.name
            });


        const chunkUrl =
            "/api/upload-chunk?" +
            params.toString();

        const sendChunk = () => uploadChunkWithProgress(
            chunkUrl,
            blob,
            (loaded) => {

                const currentUploaded =
                    uploaded + loaded;

                const percent =
                    file.size
                        ? currentUploaded /
                            file.size *
                            100
                        : 100;

                updateQueue(
                    queue,
                    percent,
                    false,
                    currentUploaded,
                    file.size
                );
            }
        );

        let attempt = 0;
        while(true){
            try{
                await sendChunk();
                break;
            }catch(error){
                attempt += 1;
                if(attempt > 4) throw error;

                const waitMs = Math.min(8000, 750 * (2 ** (attempt - 1)));
                showToast(`Retrying ${file.name} chunk ${index + 1}/${total}...`);
                await new Promise(resolve => setTimeout(resolve, waitMs));
            }
        }


        uploaded +=
            blob.size;


        updateQueue(
            queue,
            file.size
                ? uploaded /
                    file.size *
                    100
                : 100,
            false,
            uploaded,
            file.size
        );
    }


    updateQueue(
        queue,
        100,
        true,
        file.size,
        file.size
    );


    rememberRecent(
        file.name
    );


    try{
        await loadStorage();
    }catch(error){
        console.error(
            "STORAGE REFRESH AFTER UPLOAD ERROR:",
            error
        );
    }


    showToast(
        `${file.name} uploaded`
    );
}


function uploadChunkWithProgress(
    url,
    blob,
    onProgress
){

    return new Promise(
        (resolve, reject) => {

            const xhr =
                new XMLHttpRequest();

            xhr.open(
                "POST",
                url,
                true
            );

            xhr.withCredentials =
                true;

            xhr.setRequestHeader(
                "Content-Type",
                "application/octet-stream"
            );

            xhr.setRequestHeader(
                "Content-Length",
                String(blob.size)
            );

            xhr.upload.onprogress =
                event => {

                    if(
                        event.lengthComputable
                    ){

                        onProgress(
                            event.loaded
                        );
                    }
                };

            xhr.onerror =
                () => {
                    reject(
                        new Error(
                            "Network error during upload"
                        )
                    );
                };

            xhr.onabort =
                () => {
                    reject(
                        new Error(
                            "Upload cancelled"
                        )
                    );
                };

            xhr.onload =
                async () => {

                    let data = null;

                    try{
                        data =
                            JSON.parse(
                                xhr.responseText ||
                                "null"
                            );
                    }catch(_){ }

                    if(
                        xhr.status === 401
                    ){

                        showLogin();

                        reject(
                            new Error(
                                "Session expired"
                            )
                        );

                        return;
                    }

                    if(
                        xhr.status < 200 ||
                        xhr.status >= 300
                    ){

                        const error = new Error(
                            data?.error ||
                            "Upload failed"
                        );
                        error.status = xhr.status;
                        reject(error);

                        return;
                    }

                    onProgress(
                        blob.size
                    );

                    resolve(data);
                };

            xhr.send(blob);
        }
    );
}



/* =========================================================
   QUEUE
========================================================= */

function createQueueItem(
    file
){

    const item =
        document.createElement(
            "div"
        );

    item.className =
        "queueItem";


    const top =
        document.createElement(
            "div"
        );

    top.className =
        "queueTop";


    const name =
        document.createElement(
            "div"
        );

    name.className =
        "queueName";

    name.textContent =
        file.name;


    const percent =
        document.createElement(
            "div"
        );

    percent.className =
        "queuePercent";

    percent.textContent =
        "0%";


    top.append(
        name,
        percent
    );


    const remaining =
        document.createElement(
            "div"
        );

    remaining.className =
        "queueRemaining";

    remaining.textContent =
        `${formatClientBytes(0)} uploaded • ${formatClientBytes(file.size)} left`;


    const track =
        document.createElement(
            "div"
        );

    track.className =
        "queueProgress";


    const bar =
        document.createElement(
            "div"
        );


    track.appendChild(
        bar
    );


    item.append(
        top,
        remaining,
        track
    );


    uploadQueue.appendChild(
        item
    );


    return {
        item,
        percent,
        remaining,
        bar
    };
}


function updateQueue(
    queue,
    value,
    done = false,
    uploadedBytes = 0,
    totalBytes = 0
){

    const rounded =
        Math.min(
            100,
            Math.max(
                0,
                Math.round(
                    value
                )
            )
        );


    queue.percent.textContent =
        done
            ? "✓"
            : `${rounded}%`;


    queue.bar.style.width =
        `${rounded}%`;


    if(queue.remaining){

        const remainingBytes =
            Math.max(
                0,
                Number(totalBytes || 0) -
                Number(uploadedBytes || 0)
            );

        queue.remaining.textContent =
            done
                ? "Complete"
                : `${formatClientBytes(uploadedBytes)} uploaded • ${formatClientBytes(remainingBytes)} left`;
    }


    if(done){

        setTimeout(
            () => {

                queue.item.remove();

            },
            1600
        );
    }
}



/* =========================================================
   RANDOM ID
========================================================= */

function cryptoRandomId(){

    if(
        window.crypto &&
        crypto.randomUUID
    ){

        return crypto.randomUUID();
    }


    return (
        Date.now()
            .toString(36) +
        "-" +
        Math.random()
            .toString(36)
            .slice(2)
    );
}


/* =========================================================
   SEARCH
========================================================= */

searchInput.addEventListener(
    "input",
    renderFiles
);


sortSelect.addEventListener(
    "change",
    renderFiles
);


/* =========================================================
   TABS
========================================================= */

document
    .querySelectorAll(
        ".cloudTab"
    )
    .forEach(
        tab => {

            tab.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".cloudTab"
                        )
                        .forEach(
                            item =>
                                item.classList.remove(
                                    "active"
                                )
                        );


                    tab.classList.add(
                        "active"
                    );


                    activeTab =
                        tab.dataset.tab;


                    renderFiles();
                }
            );
        }
    );


/* =========================================================
   VIEW SWITCH
========================================================= */

document
    .getElementById(
        "gridView"
    )
    .addEventListener(
        "click",
        () => {

            currentView =
                "grid";


            fileList.classList.remove(
                "listView"
            );


            document
                .getElementById(
                    "gridView"
                )
                .classList.add(
                    "active"
                );


            document
                .getElementById(
                    "listView"
                )
                .classList.remove(
                    "active"
                );


            localStorage.setItem(
                VIEW_KEY,
                "grid"
            );
        }
    );


document
    .getElementById(
        "listView"
    )
    .addEventListener(
        "click",
        () => {

            currentView =
                "list";


            fileList.classList.add(
                "listView"
            );


            document
                .getElementById(
                    "listView"
                )
                .classList.add(
                    "active"
                );


            document
                .getElementById(
                    "gridView"
                )
                .classList.remove(
                    "active"
                );


            localStorage.setItem(
                VIEW_KEY,
                "list"
            );
        }
    );


/* =========================================================
   REFRESH
========================================================= */

async function refreshAll(){

    const buttons = [

        document.getElementById(
            "refreshButton"
        ),

        document.getElementById(
            "topRefresh"
        )
    ];


    buttons.forEach(
        button =>
            button.classList.add(
                "spinning"
            )
    );


    try{

        await loadEverything();

    }finally{

        setTimeout(
            () => {

                buttons.forEach(
                    button =>
                        button.classList.remove(
                            "spinning"
                        )
                );

            },
            650
        );
    }
}


document
    .getElementById(
        "refreshButton"
    )
    .addEventListener(
        "click",
        refreshAll
    );


document
    .getElementById(
        "topRefresh"
    )
    .addEventListener(
        "click",
        refreshAll
    );


/* =========================================================
   QR
========================================================= */

function openQRCode(){

    qrCode.innerHTML =
        "";


    if(
        typeof QRCode ===
        "undefined"
    ){

        qrCode.textContent =
            "QR unavailable";


        showToast(
            "QR code library unavailable"
        );


        qrModal.classList.add(
            "show"
        );


        return;
    }


    const websiteURL =
        window.location.href;


    new QRCode(
        qrCode,
        {

            text:
                websiteURL,

            width:
                164,

            height:
                164,

            colorDark:
                "#07111f",

            colorLight:
                "#ffffff",

            correctLevel:
                QRCode.CorrectLevel.M
        }
    );


    qrModal.classList.add(
        "show"
    );
}


function closeQRCode(){

    qrModal.classList.remove(
        "show"
    );

    qrCode.innerHTML =
        "";
}


qrButton.addEventListener(
    "click",
    openQRCode
);


qrClose.addEventListener(
    "click",
    closeQRCode
);


qrModal.addEventListener(
    "click",
    event => {

        if(
            event.target ===
            qrModal
        ){

            closeQRCode();
        }
    }
);


/* =========================================================
   LOAD EVERYTHING
========================================================= */

async function loadEverything(){

    try{

        await Promise.all([
            loadStorage(),
            loadFiles()
        ]);

    }catch(error){

        console.error(
            error
        );
    }
}


/* =========================================================
   FORMAT BYTES
========================================================= */

function formatBytes(
    bytes
){

    const value =
        Number(bytes);


    if(
        !Number.isFinite(value) ||
        value <= 0
    ){

        return "0 B";
    }


    const units = [
        "B",
        "KB",
        "MB",
        "GB",
        "TB"
    ];


    const index =
        Math.min(
            Math.floor(
                Math.log(value) /
                Math.log(1024)
            ),
            units.length - 1
        );


    return (
        value /
        Math.pow(
            1024,
            index
        )
    )
        .toFixed(
            index === 0
                ? 0
                : 1
        ) +
        " " +
        units[index];
}


/* =========================================================
   ESCAPE
========================================================= */

function escapeHtml(
    value
){

    return String(value)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );
}


/* =========================================================
   KEYBOARD
========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if(
            event.key ===
            "Escape"
        ){

            closeViewer();

            closeQRCode();
        }


        if(
            event.key === "/" &&

            document.activeElement !==
                searchInput &&

            document.activeElement !==
                password
        ){

            event.preventDefault();

            searchInput.focus();
        }
    }
);


/* =========================================================
   WELCOME / START
========================================================= */

window.addEventListener(
    "load",
    () => {

        // Welcome is intentionally a short 2.5s entry screen.
        // The password screen is ALWAYS the next gate; the dashboard
        // and its features are never opened directly from the welcome.
        setTimeout(
            welcomeVoice,
            450
        );

        setTimeout(
            () => {

                intro.classList.add(
                    "hide"
                );

                // Strict startup order:
                // WELCOME -> PASSWORD -> FULL CLOUD APP
                showLogin();

            },
            2500
        );
    }
);
          
