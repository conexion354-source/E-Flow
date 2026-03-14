const PASSWORD="1234nn"

function login(){

let clave=document.getElementById("clave").value

if(clave===PASSWORD){

document.getElementById("login").style.display="none"

document.getElementById("app").style.display="block"

cargar()

}

}

function cargar(){

const API="https://script.google.com/macros/s/AKfycbwP6d0JB6zJdLhJizcGHPw2cs4v3Xohreh-Qxa2AbRZWDlg91RG6j3NTdfZQpMzdx1LGw/exec"

fetch(API)
.then(r=>r.json())
.then(data=>{

let total=0

let hoy=0
let siete=0

const lista=document.getElementById("lista")

data.forEach(c=>{

let monto=parseFloat(
String(c.monto).replace(/\./g,"").replace(",",".")
)

if(!isNaN(monto)) total+=monto

const div=document.createElement("div")

div.className="cheque"

div.innerHTML=`
<b>${c.proveedor}</b>
<br>
${c.fechaPago}
<br>
$ ${c.monto}
`

lista.appendChild(div)

})

document.getElementById("cantidad").innerText=data.length

document.getElementById("total").innerText="$ "+total.toLocaleString("es-AR")

})

}
