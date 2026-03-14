
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
let siete=0

const hoy=new Date()

const lista=document.getElementById("lista")
lista.innerHTML=""

let bancos={}

datos.forEach(c=>{

let monto=parseFloat(
String(c.monto).replace(/\./g,"").replace(",",".")
)

if(!isNaN(monto)) total+=monto

if(c.banco){

if(!bancos[c.banco]) bancos[c.banco]=0
bancos[c.banco]+=monto

}

let fecha=new Date(c.fechaPago)
let diff=(fecha-hoy)/86400000

let clase=""

if(diff<0){vencidos++;clase="vencido"}
else if(diff<7){siete++;clase="proximo"}

const div=document.createElement("div")
div.className="cheque "+clase

div.innerHTML=`
<b>${c.proveedor}</b><br>
Pago: ${c.fechaPago}<br>
Banco: ${c.banco}<br>
$ ${c.monto}
`

lista.appendChild(div)

})

document.getElementById("cantidad").innerText=datos.length
document.getElementById("total").innerText="$ "+total.toLocaleString("es-AR")
document.getElementById("vencidos").innerText=vencidos
document.getElementById("siete").innerText=siete

crearGrafico(bancos)

}

function crearGrafico(bancos){

const ctx=document.getElementById("grafico")

const labels=Object.keys(bancos)
const values=Object.values(bancos)

new Chart(ctx,{
type:'pie',
data:{
labels:labels,
datasets:[{
data:values
}]
}
})

}

document.addEventListener("input",function(e){

if(e.target.id==="buscar"){

const texto=e.target.value.toLowerCase()

const filtrados=datos.filter(c=>
(c.proveedor||"").toLowerCase().includes(texto) ||
(c.banco||"").toLowerCase().includes(texto) ||
(c.numeroCheque||"").toLowerCase().includes(texto)
)

datos=filtrados
render()

}

})
