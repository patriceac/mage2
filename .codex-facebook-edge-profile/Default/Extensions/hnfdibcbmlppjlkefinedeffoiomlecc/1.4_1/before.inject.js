Window.prototype.addEventListener2 = Window.prototype.addEventListener
Window.prototype.addEventListener = function(type,listener,useCapture) { 
	if (type != "beforeunload") {
		addEventListener2(type,listener,useCapture);
	}
}
