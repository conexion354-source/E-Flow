
const API="https://script.google.com/macros/s/AKfycbwP6d0JB6zJdLhJizcGHPw2cs4v3Xohreh-Qxa2AbRZWDlg91RG6j3NTdfZQpMzdx1LGw/exec"
const PASSWORD="1234nn"

let datos=[]

function login(){

let clave=document.getElementById("clave").value

if(clave===PASSWORD){

document.getElementById("login").style.display="none"
document.getElementById("app").style.display="block"

cargar()

}else{

alert("Clave incorrecta")

}

}

function cargar(){

fetch(API)
.then(r=>r.json())
.then(data=>{

datos=data
render()

})

}

function render(){

let total=0
let vencidos=0
let proximos=0

const hoy=new Date()
const lista=document.getElementById("lista")
lista.innerHTML=""

datos.forEach(c=>{

let monto=parseFloat(String(c.monto).replace(/\./g,"").replace(",",".") )
if(!isNaN(monto)) total+=monto

let fecha=new Date(c.fechaPago)
let diff=(fecha-hoy)/86400000

let clase="cheque"
if(diff<0){vencidos++;clase+=" vencido"}
else if(diff<7){proximos++;clase+=" proximo"}

const div=document.createElement("div")
div.className=clase

div.innerHTML=`
<b>${c.proveedor}</b><br>
Banco: ${c.banco}<br>
Pago: ${c.fechaPago}<br>
$ ${c.monto}
`

lista.appendChild(div)

})

document.getElementById("cantidad").innerText=datos.length
document.getElementById("total").innerText="$ "+total.toLocaleString("es-AR")
document.getElementById("vencidos").innerText=vencidos
document.getElementById("proximos").innerText=proximos

}
