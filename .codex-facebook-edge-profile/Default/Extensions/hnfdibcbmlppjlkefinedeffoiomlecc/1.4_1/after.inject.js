function letmeout() {
	var all = document.getElementsByTagName("*");
	for (var i=0, max=all.length; i < max; i++) {
		if(all[i].getAttribute("onbeforeunload")) {
			all[i].setAttribute("onbeforeunload", null);
		}
	}
	window.onbeforeunload = null;
}
letmeout();
setInterval(letmeout,500);
