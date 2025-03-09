/**
 * barea.js
 * 
 * Author: Johan Filipsson
 * License: MIT
 * Description: A lightweight and reactive JavaScript library for modern web applications.
 * 
 * Copyright (c) 2025 Johan Filipsson
 */

"use strict";

const getBareaApp = function(enableInternalId){
    return new BareaApp(enableInternalId);
}

class BareaApp 
{
    #appElement; 
    #bareaId=0;
    #internalSystemCounter = 0;
    #appDataProxy; 
    #appDataProxyCache = new WeakMap();
    #dynamicExpressionRegistry = new Map();
    #computedPropertyNames = [];
    #appData;
    #methods = {};
    #consoleLogs = [];
    #mounted=false;
    #mountedHandler=null;
    #computedProperties = {};
    #enableBareaId = false;
    #enableHideUnloaded=false;
    #uiDependencyTracker=null;
    #computedPropertiesDependencyTracker =  null;

    constructor(enableInternalId) 
    {
        if (enableInternalId)
            this.#enableBareaId=enableInternalId;

        this.#computedPropertiesDependencyTracker = this.#getComputedPropertiesDependencyTracker();
        this.#uiDependencyTracker = this.#getUserInterfaceTracker(this.#handleUITrackerNofify);
        this.#setConsoleLogs(); 
    }

    mount(element, content) 
    {
        if (this.#mounted)
            return;

        this.#mounted=true;

        if (!content){
            console.error('Illegal use of mount, please pass a content object with data and methods');
            return;
        }

        if (!content.data){
            console.error('Illegal use of mount, please pass a content object with data and methods');
            return;
        }


        if (!element)
        {
            console.error('Illegal use of mount, please pass an element or an element identifier');
            return;
        }

        if (typeof element === "object") 
            this.#appElement = element
        else
            this.#appElement = document.getElementById(element);

        this.#appData = content.data;
        this.#appDataProxy = content.data;

        //Methods
        if (content.methods)
        {
            this.#methods = content.methods;
            Object.assign(this, this.#methods);
            Object.keys(content.methods).forEach(key => {
                if (typeof this[key] === "function") {
                    this[key] = this[key].bind(this);
                }
            }); 
        }

        //Computed
        if (content.computed) {
            Object.keys(content.computed).forEach(key => {
                if (typeof content.computed[key] === "function") {
                    this.#computedProperties[key] = this.#getNewComputedProperty(content.computed[key], key);
                    this.#computedPropertyNames.push(key);
                }
            });
        
            Object.keys(this.#computedProperties).forEach(key => {
                Object.defineProperty(this, key, {
                    get: () => this.#computedProperties[key].value, 
                    enumerable: true,
                    configurable: true
                });
            });
        }
        

        if (content.mounted)
        {
            this.#mountedHandler = content.mounted;
        }

        if (this.#enableHideUnloaded)
        {
            document.addEventListener('DOMContentLoaded',this.#loadedHandler);
        }else{
            document.querySelectorAll(".ba-cloak").forEach(el => el.classList.remove("ba-cloak"));
        }
       
        if (!('fetch' in window && 'Promise' in window && 'Symbol' in window && 'Map' in window))
        {
            console.error('Your browser and js engine is too old to use this script');
            return;
        }
          
        const proxy = this.#createReactiveProxy((path, reasonobj, reasonkey, reasonvalue, reasonfuncname="") => 
        { 
            //Handles changes in the data and updates the dom
            let log = this.#getConsoleLog(1);
            if (log.active)
                console.log(log.name, path, reasonobj, reasonkey, reasonvalue, reasonfuncname);

            //Tweak for array functions
            //On array asssign: reasonobj=parent, reasonkey=arrayname, we will do the same here
            if (Array.isArray(reasonobj) && BareaHelper.ARRAY_FUNCTIONS.includes(reasonfuncname)){
                let objpath = BareaHelper.getLastBareaObjectName(path);
                reasonkey = BareaHelper.getLastBareaKeyName(path);
                reasonobj=this.getProxifiedPathData(objpath);
                if (!reasonobj)
                    console.error('could not find array on path: ' + path);
            }

            this.#uiDependencyTracker.notify(path, reasonobj, reasonkey, reasonvalue, reasonfuncname);

        }, this.#appData);

        this.#appDataProxy = proxy;
  
        //Important: Always directly after proxification
        //Track UI
        this.#trackDirectives();
      

        if (this.#enableBareaId && ! this.#appDataProxy.hasOwnProperty('baId')) 
            this.#appDataProxy.baId = ++this.#bareaId;  // Assign a new unique ID

        if (this.#mountedHandler) 
        {  
            this.#mountedHandler.apply(this, [this.#appDataProxy]);
        }
   

        return this.#appDataProxy;
    }

    getData()
    {
        if (!this.#mounted)
        {
            console.warn("barea.js is not mounted. Call mount on the instance before using this method.");
            return;
        }
        return this.#appDataProxy;
    }

    enableHideBeforeLoaded(value)
    {
        if (this.#isPrimitive(value))
            this.#enableHideUnloaded = value;
    }
   
    addHandler(functionName, handlerFunction) 
    {
        if (typeof handlerFunction === "function")
        {
            this.#methods[functionName] = handlerFunction;
        } 
        else 
        {
            console.warn(`Handler for "${functionName}" is not a function.`);
        }
    }


    getProxifiedPathData(path) 
    {
        if (!path) 
            return this.#appDataProxy;

        const keys = path.match(/[^.[\]]+/g);
        if (!keys) 
            return this.#appDataProxy; 

        let target = this.#appDataProxy;
    
        for (let i = 0; i < keys.length; i++) {
            if (i === 0 && keys[i].toLowerCase() === 'root') continue; 
            if (!target) return undefined; 
            target = target[keys[i]];
        }
    
        return target;
    }

    getPathData(path) 
    {
        if (!path) 
            return this.#appData; 

        const keys = path.match(/[^.[\]]+/g);
        if (!keys) 
            return this.#appData; 

        let target = this.#appData;
    
        for (let i = 0; i < keys.length; i++) {
            if (i === 0 && keys[i].toLowerCase() === 'root') continue; 
            if (!target) return undefined; 
            target = target[keys[i]];
        }
    
        return target;
    }

    //Generates a flat object from any object
    getObjectDictionary(obj, parentKey = '') {
        let result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newKey = parentKey ? `${parentKey}.${key}` : key;
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (Array.isArray(obj[key])) {
                        result[newKey] = obj[key]; 
                        obj[key].forEach((item, index) => {
                            result[`${newKey}[${index}]`] = item; 
                            Object.assign(result, this.getObjectDictionary(item, `${newKey}[${index}]`));
                        });
                    } else {
                        result[newKey] = obj[key]; 
                        Object.assign(result, this.getObjectDictionary(obj[key], newKey));
                    }
                } else {
                    result[newKey] = obj[key];  
                }
            }
        }
    
        return result;
    }

    /**
     * The heart, the proxy
     * A recursive proxy for reactivity
     * Strategy: 1. Only proxy on get, 2. Always get data after set (callback)
     */
    #createReactiveProxy(callback, data, currentpath = "root") 
    {

        const handler = {
            get: (target, key, receiver) => {

                let value = Reflect.get(target, key, receiver);

                const newPath = Array.isArray(target) ? `${currentpath}[${key}]` : `${currentpath}.${key}`;
              
                //They will only be tracked if the computed function is run
                //The function activates tracking
                if(typeof value === "function" && BareaHelper.ARRAY_FUNCTIONS.includes(value.name))
                    this.#computedPropertiesDependencyTracker.track(newPath, value.name);
                else
                    this.#computedPropertiesDependencyTracker.track(newPath, null);

                if (Array.isArray(target))
                {
                    //These won't be detected otherwise
                    BareaHelper.ARRAY_FUNCTIONS.forEach(f=>{ this.#computedPropertiesDependencyTracker.track(currentpath, f);});
                }
                
               
                if (typeof value === 'object' && value !== null) 
                {
                  
                    if (!Array.isArray(value) && this.#enableBareaId && !value.hasOwnProperty('baId')) 
                    {
                        value.baId = ++this.#bareaId;  
                    }

                    if (this.#appDataProxyCache.has(value)) {
                        return this.#appDataProxyCache.get(value);
                    }
            
                    const proxiedvalue = this.#createReactiveProxy(callback, value, newPath); 
                    this.#appDataProxyCache.set(value, proxiedvalue);
                    return proxiedvalue;

                }else{

                    if(typeof value === "function")
                    {
                        if (BareaHelper.ARRAY_FUNCTIONS.includes(value.name)) 
                        {
                            if (!this.bareaWrappedMethods) {
                                this.bareaWrappedMethods = new Map();
                            }
                            let funckey = currentpath+'_'+value.name;
                            if (!this.bareaWrappedMethods.has(funckey)) {
                                this.bareaWrappedMethods.set(funckey, (...args) => 
                                {

                                    let proxyargs =[];
                                    args.forEach(t=>
                                    {
                                        let proxyargobj = null;
                                        if (typeof t === "object"){
                                            proxyargobj = this.#createReactiveProxy(callback, t);
                                            if (!this.#appDataProxyCache.has(t)) 
                                                this.#appDataProxyCache.set(t, proxyargobj);
                                        }else{
                                            proxyargobj=t;
                                        }
                                        

                                        proxyargs.push(proxyargobj);
                                    });
                                
                
                                    const result = value.apply(target, args); 

                                    this.#computedPropertiesDependencyTracker.notify(currentpath, value.name);

                                    callback(currentpath, receiver, '', proxyargs, value.name);

                                    return result;
                                });
                            }
                        
                            return this.bareaWrappedMethods.get(funckey);

                        }    
        
                    }
                }
              
                return value;
            },
            set: (target, key, value, receiver) => {

                const newPath = Array.isArray(target) ? `${currentpath}[${key}]` : `${currentpath}.${key}`;

                if(typeof value === "function" && !BareaHelper.ARRAY_FUNCTIONS.includes(value.name))
                    return true;

                if (target[key] === value) 
                    return true;
        
                target[key] = value;

                if(typeof value === "function"  && BareaHelper.ARRAY_FUNCTIONS.includes(value.name))
                    this.#computedPropertiesDependencyTracker.notify(newPath, value.name);
                else
                    this.#computedPropertiesDependencyTracker.notify(newPath, null);

                
                 
                //Out puts raw data (no proxy here)
                callback(newPath, receiver, key, receiver[key]);

                return true;
            }
        };
        
        let proxiedValue =new Proxy(data, handler);
        return proxiedValue;

    }

    #trackDirectives(tag=this.#appElement, trackcontext={template:null, rendereddata:null, renderedindex:-1, renderedvarname:"", renderedobjid:-1})
    {
      

        //Validate templates before proceeding
        let templateChildren = this.#validateTemplateChildren();
       
        //Find the world of barea.js (elements with attributes starting with ba-
        const bareaElements = Array.from(tag.querySelectorAll("*")).filter(el =>
            el.attributes.length && Array.prototype.some.call(el.attributes, attr => attr.name.startsWith("ba-"))
        );
    
        bareaElements.forEach(el => {
            const bareaAttributes = Array.from(el.attributes)
                .filter(attr => attr.name.startsWith("ba-"))
                .map(attr => ({ name: attr.name, value: attr.value }));

                 //Skip all children of templates since they will be dealt with later on template rendering
                if (templateChildren.includes(el))
                    return;

                bareaAttributes.forEach(attr =>
                {

                    if (!attr.value)
                        return;

                    this.#internalSystemCounter++;

            
                    if (BareaHelper.DIR_GROUP_BIND_TO_PATH.includes(attr.name))
                    {
                        const attribute_value_type = this.#getExpressionType(attr.value, attr.name);
                        if (attribute_value_type===BareaHelper.EXPR_TYPE_INVALID)
                        {
                            console.error(`The ${attr.name} directive with value: (${attr.value}) is invalid.`);
                            return;
                        }

                        let inputtype = "";
                        let systeminput = -1;
                        if (BareaHelper.DIR_GROUP_UI_DUPLEX.includes(attr.name))
                        {
                            inputtype = el.getAttribute("type");
                            if (!inputtype){
                                systeminput=4;
                            }else{
                                systeminput = 1;
                                if (inputtype.toLowerCase()==="text")
                                    systeminput=1;
                                if (inputtype.toLowerCase()==="checkbox")
                                    systeminput=2;
                                if (inputtype.toLowerCase()==="radio")
                                    systeminput=3;
                            }
                        }

                        let tracking_obj = this.#createInputDirective(trackcontext,el,attr.name,attr.value,null,"",systeminput);
                        tracking_obj.expressiontype = attribute_value_type;

                
                        //If root is included in the attr.value, example root.model.users.name
                        //Then we will bind to the root even if this is a template node
                        if (!trackcontext.rendereddata || attr.value.startsWith(BareaHelper.ROOT_OBJECT)){
                            let objpath = BareaHelper.getLastBareaObjectName(attr.value);
                            tracking_obj.data=this.getProxifiedPathData(objpath);
                            tracking_obj.key=BareaHelper.getLastBareaKeyName(attr.value);
                        }else{
                            tracking_obj.data=trackcontext.rendereddata;
                            tracking_obj.key=BareaHelper.getLastBareaKeyName(attr.value);
                        }

                        if (!tracking_obj.data || !tracking_obj.key){
                            console.error(`Could not track directive ${attr.name}${attr.value} could not match data at the given path`);
                            return;
                        }

                
                        let handlername = el.getAttribute(BareaHelper.DIR_BIND_HANDLER);
                        if (handlername)
                        {
                            const check_handler = this.#getExpressionType(handlername, BareaHelper.DIR_BIND_HANDLER);
                            if (check_handler===BareaHelper.EXPR_TYPE_INVALID)
                            {
                                console.error(`The ${BareaHelper.DIR_BIND_HANDLER} directive has an invalid value (${handlername}), should be funcname(), or funcname(args..).`);
                                return;
                            }

                            tracking_obj.hashandler=true;
                            tracking_obj.handlername=handlername;
                        
                        }
                        
                        
                        this.#uiDependencyTracker.track('value', tracking_obj);

                            if (BareaHelper.DIR_GROUP_UI_DUPLEX.includes(tracking_obj.directivename))
                            {
                                if (tracking_obj.hashandler)
                                    this.#runBindHandler(BareaHelper.VERB_SET_UI, tracking_obj);
                            
                                if (tracking_obj.inputtype === BareaHelper.UI_INPUT_TEXT){
                                    this.#setInputText(tracking_obj);
                                }
                                else if (tracking_obj.inputtype === BareaHelper.UI_INPUT_CHECKBOX){
                                    this.#setInputCheckbox(tracking_obj);
                                }
                                else if (tracking_obj.inputtype === BareaHelper.UI_INPUT_RADIO){
                                    this.#setInputRadio(tracking_obj);
                                }

                                let eventtype = (tracking_obj.directivename===BareaHelper.DIR_BIND) ? "input" : "blur";
                                el.addEventListener(eventtype, (event) => {

                                    if (tracking_obj.hashandler)
                                    {
                                            this.#runBindHandler(BareaHelper.VERB_SET_DATA, tracking_obj);
                                            return;
                                    }

                                    const log = this.#getConsoleLog(3);
                                    if (tracking_obj.inputtype === BareaHelper.UI_INPUT_CHECKBOX){
                                        if (log.active)
                                            console.log(log.name, "type: " + el.type, "key: " + valuekey, "input value: " + el.checked);
                
                                        tracking_obj.data[tracking_obj.key] =  el.checked;
                                    } 
                                    else if (tracking_obj.inputtype === BareaHelper.UI_INPUT_RADIO){
                                        if (log.active)
                                            console.log(log.name, "type: " + el.type, "key: " + valuekey, "input value: " + el.value);
                
                                        if (el.checked)
                                            tracking_obj.data[tracking_obj.key] =  el.value;
                
                                    } 
                                    else {
                                        if (log.active)
                                            console.log(log.name, "type: " + el.type, "key: " + valuekey, "input value: " + el.value);
                
                                        tracking_obj.data[tracking_obj.key] =  el.value;
                
                                    }
                                });   
                                   
                                
                            }
                            else if (tracking_obj.directivename===BareaHelper.DIR_CLASS){
                                let classnames = el.getAttribute('classNames');
                                tracking_obj.orgvalue=classnames;
                                this.#setClass(tracking_obj);
                            }
                            else if (tracking_obj.directivename===BareaHelper.DIR_HREF){
                                this.#setHref(tracking_obj);
                            }
                            else if (tracking_obj.directivename===BareaHelper.DIR_IMAGE_SRC){
                                this.#setSrc(tracking_obj);
                            }
                          
                            
                    }
                    else if (BareaHelper.DIR_GROUP_COMPUTED.includes(attr.name))
                    {

                        const attribute_value_type = this.#getExpressionType(attr.value, attr.name, trackcontext.renderedvarname);
                        if (attribute_value_type===BareaHelper.EXPR_TYPE_INVALID)
                         {
                            console.error(`Then ${attr.name} directive has an invalid value (${attr.value}).`);
                            return;
                        }
    
                        const tracking_obj = this.#createComputedDirective(trackcontext,el,attr.name,attr.value);
                        tracking_obj.expressiontype = attribute_value_type;

                        //If root expression force root data to be executed
                        if (!trackcontext.rendereddata){
                            tracking_obj.data=this.#appDataProxy;
                        }else{
                            tracking_obj.data=trackcontext.rendereddata;
                        }
                        tracking_obj.key="";

                        let condition = attr.value.trim();
                        if (condition.includes('?'))
                            condition = condition.split('?')[0];

                        
                        let isnewhandler = false;
                        let handlername = this.#dynamicExpressionRegistry.get(attr.value);
                        if (!handlername || trackcontext.rendereddata) //Must use different handlers, since notification doesn't work otherwise.
                        {
                            isnewhandler=true;
                            if ((trackcontext.template)){ //Is template directive
                                handlername = `${BareaHelper.META_DYN_TEMPLATE_FUNC_PREFIX}${this.#internalSystemCounter}`;
                            }else{
                                handlername = `${BareaHelper.META_DYN_FUNC_PREFIX}${this.#internalSystemCounter}`;
                            }
                            this.#dynamicExpressionRegistry.set(attr.value, handlername);
                        }

                       
                        if (attr.name === BareaHelper.DIR_IF){
                            tracking_obj.elementnextsibling=el.nextSibling;
                            tracking_obj.parentelement=el.parentElement;
                        }
            
                        if (attribute_value_type === BareaHelper.EXPR_TYPE_COMPUTED)
                        {
                            tracking_obj.handlername=condition;
                            this.#computedProperties[tracking_obj.handlername].addDependentDirective(tracking_obj);
                            this.#runComputedFunction(tracking_obj);
                        }
                        else if (attribute_value_type === BareaHelper.EXPR_TYPE_ROOT_EXPR){
                    
                            const evalobj = this.#appDataProxy;
                            const boolRootFunc = function()
                            {
                                function  evalRootExpr(condition, context) {
                                    try {
                                        return new Function("contextdata", `return ${condition};`)(context);
                                    } catch (error) {
                                        console.error(`Error evaluating expression ${condition} on ${el.localName} with attribute ${attr.name}`);
                                        return false;
                                    }
                                }
                                
                                condition=condition.replaceAll('root.','contextdata.');
                                return evalRootExpr(condition, evalobj);
                            }

                            if (isnewhandler)
                            {
                                this.#computedProperties[handlername] = this.#getNewComputedProperty(boolRootFunc,handlername);
                                this.#computedPropertyNames.push(handlername);
                            }
                            tracking_obj.handlername=handlername;
                            tracking_obj.iscomputed=true;
                            this.#computedProperties[tracking_obj.handlername].addDependentDirective(tracking_obj);
                            this.#runComputedFunction(tracking_obj);

                        }
                        else if (attribute_value_type === BareaHelper.EXPR_TYPE_OBJREF_EXPR)
                        {
                        
                            const boolObjFunc = function()
                            {
                                function  evalObjExpr(condition, context) {
                                    try {
                                        return new Function("contextdata", `return ${condition};`)(context);
                                    } catch (error) {
                                        console.error(`Error evaluating expression ${condition} on ${el.localName} with attribute ${attr.name}`);
                                        return false;
                                    }
                                }
                                
                                condition=condition.replaceAll(trackcontext.renderedvarname+'.','contextdata.');
                                return evalObjExpr(condition, tracking_obj.data);
                            }

                            if (!trackcontext.renderedvarname)
                            {
                                console.error(`Invalid expression: ${condition} to use as a dynamicly created function in a template.`);
                                return;
                            }

                            if (isnewhandler)
                            {
                                this.#computedProperties[handlername] = this.#getNewComputedProperty(boolObjFunc,handlername);
                                this.#computedPropertyNames.push(handlername);
                            }
                            tracking_obj.handlername=handlername;
                            tracking_obj.iscomputed=true;
                            this.#computedProperties[tracking_obj.handlername].addDependentDirective(tracking_obj);
                            this.#runComputedFunction(tracking_obj);
                           
                        }  
                        else if (attribute_value_type === BareaHelper.EXPR_TYPE_MIX_EXPR)
                        {
                        
                            const subobj = tracking_obj.data;
                            const rootobj = this.#appDataProxy;
                          
                            const boolMixedFunc = function()
                            {
                                function  evalMixedExpr(condition, subdata, rootdata) {
                                    try {
                                        return new Function("subdata","rootdata", `return ${condition};`)(subdata,rootdata);
                                    } catch (error) {
                                        console.error(`Error evaluating mixed expression ${condition} on ${el.localName} with attribute ${attr.name}`);
                                        return false;
                                    }
                                }
                                
                                condition=condition.replaceAll('root.','rootdata.');
                                condition=condition.replaceAll(trackcontext.renderedvarname+'.','subdata.');
                                return evalMixedExpr(condition, subobj,rootobj);
                            }

                            if (!trackcontext.renderedvarname)
                            {
                                console.error(`Invalid expression: ${condition} to use as a dynamicly created function in a template.`);
                                return;
                            }

                            if (isnewhandler)
                            {
                                this.#computedProperties[handlername] = this.#getNewComputedProperty(boolMixedFunc,handlername);
                                this.#computedPropertyNames.push(handlername);
                            }
                            tracking_obj.handlername=handlername;
                            tracking_obj.iscomputed=true;
                            this.#computedProperties[tracking_obj.handlername].addDependentDirective(tracking_obj);
                            this.#runComputedFunction(tracking_obj);
                        
                        }
                        
                    }
                    else if (BareaHelper.DIR_GROUP_TRACK_AND_FORGET.includes(attr.name))
                    {
                        const attribute_value_type = this.#getExpressionType(attr.value, attr.name);
                        if (attribute_value_type===BareaHelper.EXPR_TYPE_INVALID)
                        {
                            console.error(`Then ${attr.name} directive has an invalid value (${attr.value}).`);
                            return;
                         }

                        //SPECIAL: NO TRACKING, ONLY REGISTER HANDLER
                        if (attribute_value_type === BareaHelper.EXPR_TYPE_HANDLER)
                        {
                            el.addEventListener("click", (event) => {
                  
                                let eventdata = this.#appDataProxy;
                                let bapath = el.getAttribute(BareaHelper.META_PATH);
                                if (!bapath)
                                {
                                    if (trackcontext.rendereddata)
                                         eventdata = trackcontext.rendereddata;
                                }
                                else
                                {
                                    eventdata = this.getProxifiedPathData(bapath);
                                }
                                  
                                let allparams = [event, el, eventdata];
                                let pieces = BareaHelper.parseBareaFunctionCall(attr.value);
                                allparams.push(...pieces.params);
                                if (this.#methods[pieces.functionName]) {
                                       this.#methods[pieces.functionName].apply(this, allparams);
                                } else {
                                    console.warn(`Handler function '${pieces.functionName}' not found.`);
                                }
                            });     
                        }
                        
                    }
                    else if (BareaHelper.DIR_GROUP_MARKUP_GENERATION.includes(attr.name))
                    {
                        const attribute_value_type = this.#getExpressionType(attr.value, attr.name);
                        if (attribute_value_type===BareaHelper.EXPR_TYPE_INVALID)
                        {
                            console.error(`Then ${attr.name} directive has an invalid value (${attr.value}).`);
                            return;
                         }

                         let [varname, datapath] = attr.value.split(" in ").map(s => s.trim());
                         if (!varname)
                         {
                             console.error(`No variable name was found in the ${attr.name} expression`);
                             return;
                         }
                         if (!datapath)
                         {
                             console.error(`No path or computed function was found in the ${attr.name} expression`);
                             return;
                         }

                        
                        let templateHtml = el.innerHTML.trim()
                            .replace(/>\s+</g, '><')  // Remove spaces between tags
                            .replace(/(\S)\s{2,}(\S)/g, '$1 $2'); // Reduce multiple spaces to one inside text nodes
        
                        const tracking_obj = this.#createTemplateDirective(trackcontext,el,attr.name,attr.value,null,"", el.parentElement,templateHtml, el.localName);
                        tracking_obj.expressiontype = attribute_value_type;
                        if (attribute_value_type!==BareaHelper.EXPR_TYPE_COMPUTED)
                        {
                            let objpath = BareaHelper.getLastBareaObjectName(datapath);
                            tracking_obj.data = this.getProxifiedPathData(objpath);
                            tracking_obj.key = BareaHelper.getLastBareaKeyName(datapath);
                            el.remove();
                            if (!Array.isArray(tracking_obj.data[tracking_obj.key]))
                            {
                                console.error(`could not find array for ${datapath} in  ${attr.name} directive`);
                                return;
                            }
                            this.#uiDependencyTracker.track('value', tracking_obj);
                           
                        }else{
                            this.#computedProperties[datapath].addDependentDirective(tracking_obj);
                            this.#uiDependencyTracker.track('computed', tracking_obj);
                        }

                        this.#renderTemplates(tracking_obj);
                          
                    }
                  

                });                 

        });

        let nodes_with_expressions = this.#getInterplationNodesAndExpressions(tag);
        nodes_with_expressions.forEach(inode=>
        {

            let node = inode.textNode;
            let nodeexpressions = [];
            inode.expressions.forEach(expr=>
            {

                let path = expr.replaceAll('{','').replaceAll('}','').trim();
                const attribute_value_type = this.#getExpressionType(path,BareaHelper.DIR_INTERPOLATION, trackcontext.renderedvarname);
                if (attribute_value_type===BareaHelper.EXPR_TYPE_INVALID)
                {
                    console.error(`The ${DIR_INTERPOLATION} directive has an invalid expression (${path}).`);
                    return;
                }

                let tracking_obj = this.#createInterpolationDirective(trackcontext,BareaHelper.DIR_INTERPOLATION,path,null,"",node, expr, node.nodeValue);
                tracking_obj.expressiontype = attribute_value_type;
                if (attribute_value_type===BareaHelper.EXPR_TYPE_COMPUTED){
                    tracking_obj.isrendered = false;
                    tracking_obj.iscomputed = true;
                    nodeexpressions.push(tracking_obj);
                }
                else if ([BareaHelper.EXPR_TYPE_ROOT_PATH,BareaHelper.EXPR_TYPE_OBJREF,BareaHelper.EXPR_TYPE_OBJREF_PATH].includes(attribute_value_type))
                {
                    //Find data
                    let objpath=BareaHelper.ROOT_OBJECT;
                    if (!trackcontext.rendereddata || path.startsWith(BareaHelper.ROOT_OBJECT)){
                        objpath = BareaHelper.getLastBareaObjectName(path);
                        tracking_obj.data=this.getProxifiedPathData(objpath);
                    }else{
                        tracking_obj.data = trackcontext.rendereddata;
                    }

                    //Find key
                    tracking_obj.key="";
                    let interpolation_key = BareaHelper.getLastBareaKeyName(path);
                    if (interpolation_key!==BareaHelper.OBJECT && interpolation_key!==objpath){
                        tracking_obj.key=interpolation_key;
                    }

                    tracking_obj.isrendered = false;
                    tracking_obj.iscomputed = false;
                    nodeexpressions.push(tracking_obj);
                      
                }
                else if (BareaHelper.INTERPOL_INDEX===attribute_value_type)
                {
                    //Wont be tracked
                    tracking_obj.isrendered = true;
                    tracking_obj.iscomputed = false;
                    tracking_obj.data = trackcontext.rendereddata;
                    nodeexpressions.push(tracking_obj); 
                    if (trackcontext.template)  
                        trackcontext.template.usesReRenderedInterpolation = true;
                }
                        
            });  
                    
            if (nodeexpressions.length>0)
            {
                //Important must render per node so multiple expressions in one node leads to double tracking
                nodeexpressions.forEach(ne=>
                {
                    ne.nodeexpressions = nodeexpressions;
                    if (ne.isrendered){
                        this.#uiDependencyTracker.track('nontrackable', ne);
                    }
                    else if (ne.iscomputed && this.#computedProperties[ne.directivevalue]){
                        this.#computedProperties[ne.directivevalue].addDependentDirective(ne);
                    }else if (ne.key){
                        this.#uiDependencyTracker.track('value', ne);
                    }else if  (ne.data) {
                        this.#uiDependencyTracker.track('object', ne);
                    }

                    this.#setInterpolation(ne);

                }); 
                     
            }
                   
        });  
            
       
           
        let log = this.#getConsoleLog(4);
        if (log.active){length
            console.log(log.name);
            this.#uiDependencyTracker.getAllDependencies().forEach((value, key) => {
                console.log(key, value);
            });
        }

        log = this.#getConsoleLog(5);
        if (log.active){length
            console.log(log.name);
            this.#computedPropertiesDependencyTracker.getAllDependencies().forEach((value, key) => {
                console.log(key, value);
            });
        }

        
    }

    #getInterplationNodesAndExpressions(root = this.#appElement) 
    {
        let walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                return (node.nodeValue.includes('{{') && node.nodeValue.includes('}}')) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
    
        let results = [];
        //parentElement: walker.currentNode.parentNode
        while (walker.nextNode()) {
           let inode = { textNode: walker.currentNode, expressions:[] };
           inode.expressions=this.#extractInterpolations(inode.textNode.nodeValue);
           results.push(inode);
        }
        return results;
    }
    

     /**
     * Validates templates and removes them if invalid
     * @returns An array of successfully validated template children
     */
    #validateTemplateChildren(tag=this.#appElement)
    {
        //There can't be templates in generated content
        //No support for dynamic templates :)
        if (tag !== this.#appElement)
            return;

         //Collect children of the template (this is the user generated template, that should be replaced)
         let templateChildren=[];
         let resultChildren=[];
         function collectDescendants(ce, templateroot) 
         {
            templateChildren.push(ce);
            for (let i = 0; i < ce.children.length; i++) 
            {
                   collectDescendants(ce.children[i]);
            }
           
         }

         tag.querySelectorAll(`[${BareaHelper.DIR_FOREACH}]`).forEach(templateroot => 
         {
            let isValidTemplate = true;
            templateChildren=[];
             Array.from(templateroot.children).forEach(child => collectDescendants(child, templateroot));
            
            let templateattr = templateroot.getAttribute(BareaHelper.DIR_FOREACH);
            let [varname, datapath] = templateattr.split(" in ").map(s => s.trim());
            if (!varname){
                isValidTemplate=false;
                console.error(`No variable name was found in the ${BareaHelper.DIR_FOREACH} expression: ${templateattr}`);
                isValidTemplate = false;
            }
            if (!datapath){
                isValidTemplate=false;
                console.error(`No path or computed function was found in the ${BareaHelper.DIR_FOREACH} expression: ${templateattr}`);
                isValidTemplate = false;
            }

            templateChildren.forEach(child=>{
                BareaHelper.DIR_GROUP_BIND_TO_PATH.forEach(dir=>{
                    if (child.hasAttribute(dir)){
                        let bareaattrib = child.getAttribute(dir);
                        if (!bareaattrib.includes(BareaHelper.ROOT_OBJECT)){
                            if (!bareaattrib.includes(varname)){
                                isValidTemplate=false;
                                console.error(`The ${dir} expression ${bareaattrib} used in an element under ${BareaHelper.DIR_FOREACH} does not match the ${BareaHelper.DIR_FOREACH} expression, data should be reference by '${varname}'. or '${BareaHelper.ROOT_OBJECT}'.`);
                                isValidTemplate = false;
                            }
                        }
                    }
                });
            });

             if (!isValidTemplate){
                //Remove the invalid template
                templateroot.parentElement.innerHTML="";
             }else{
                resultChildren.push(...templateChildren);
             }
         });


        return resultChildren;
      
    }

    #createComputedDirective(trackcontext, element, directivename, directivevalue)
    {
        let id = this.#internalSystemCounter++;
        return {id: id, renderedobjid:trackcontext.renderedobjid,  renderedvarname: trackcontext.renderedvarname, template: trackcontext.template, directivename:directivename,  directivevalue:directivevalue, element: element, data:null, key:"", hashandler:false, handlername:"", inputtype:-1, iscomputed:true };
    }

    #createInputDirective(trackcontext, element, directivename, directivevalue, data, key, inputtype)
    {
        let id = this.#internalSystemCounter++;
        return {id: id, renderedobjid:trackcontext.renderedobjid, renderedvarname: trackcontext.renderedvarname, template: trackcontext.template, directivename:directivename,  directivevalue:directivevalue, element: element, data:data, key:key, hashandler:false, handlername:"", inputtype:inputtype,iscomputed:false };
    }
    #createTemplateDirective(trackcontext, element, directivename, directivevalue, data, key,  parentelement, templatemarkup, templatetagname)
    {
        let id = this.#internalSystemCounter++;
        return {id: id, renderedobjid:trackcontext.renderedobjid, renderedvarname: trackcontext.renderedvarname, template: trackcontext.template, directivename:directivename,  directivevalue:directivevalue, element: element, data:data, key:key, hashandler:false, handlername:"", inputtype:-1, iscomputed:false, parentelement : parentelement, templatemarkup : templatemarkup, templatetagname : templatetagname, usesReRenderedInterpolation:false };
    }
    #createInterpolationDirective(trackcontext, directivename, directivevalue, data, key,interpolatednode, expression, nodetemplate)
    {
        let id = this.#internalSystemCounter++;
        return {id: id, renderedobjid:trackcontext.renderedobjid, renderedvarname: trackcontext.renderedvarname, template: trackcontext.template, directivename:directivename,  directivevalue:directivevalue, element: null, data:data, key:key, hashandler:false, handlername:"", inputtype:-1, iscomputed:false, isrendered:false, interpolatednode: interpolatednode, expression: expression, nodetemplate:nodetemplate, nodeexpressions:[], renderedindex: trackcontext.renderedindex  };
    }

    #handleUITrackerNofify = (reasonobj, reasonkey, reasonvalue, path, resultset, reasonfuncname) =>
    {
        resultset.forEach(directive => 
        {
            if (BareaHelper.DIR_GROUP_BIND_TO_PATH.includes(directive.directivename)){

                    if (directive.hashandler){
                        this.#runBindHandler(BareaHelper.VERB_SET_UI, directive);
                        return;
                    }

                    if (BareaHelper.DIR_GROUP_UI_DUPLEX.includes(directive.directivename))
                    {
                        if (directive.inputType === BareaHelper.UI_INPUT_TEXT){
                            this.#setInputText(directive);
                        }
                        else if (directive.inputType === BareaHelper.UI_INPUT_CHECKBOX){
                            this.#setInputCheckbox(directive);
                        }
                        else if (directive.inputType === BareaHelper.UI_INPUT_RADIO){
                            this.#setInputRadio(directive);
                        }
                    }
                    else if (directive.directivename===BareaHelper.DIR_CLASS){
                        this.#setClass(directive);
                    }
                    else if (directive.directivename===BareaHelper.DIR_HREF){
                        this.#setHref(directive);
                    }
                    else if (directive.directivename===BareaHelper.DIR_IMAGE_SRC){
                        this.#setSrc(directive);
                    }
                    
                    
            }
            else if (directive.directivename===BareaHelper.DIR_INTERPOLATION){

                this.#setInterpolation(directive);
            }   
            else if (BareaHelper.DIR_GROUP_MARKUP_GENERATION.includes(directive.directivename)){

                if (reasonfuncname && BareaHelper.ARRAY_FUNCTIONS.includes(reasonfuncname))
                    this.#renderTemplates(directive,path,null,reasonfuncname, reasonvalue); 
                else
                    this.#renderTemplates(directive,path,reasonvalue,"", null); 

            }
            else if (BareaHelper.DIR_GROUP_COMPUTED.includes(directive.directivename))
            {
                this.#runComputedFunction(directive);
            }
        });
    }

    
  
    #runComputedFunction(directive)
    {

        let handlername = directive.handlername;
        let boundvalue = false;
        if (this.#computedProperties[handlername]) {
                boundvalue = this.#computedProperties[handlername].value;
        } else {
            console.warn(`Computed boolean function '${handlername}' not found.`);
        }
        
        if (directive.directivename===BareaHelper.DIR_HIDE)
            directive.element.style.display = boundvalue ? "none" : ""
        else if (directive.directivename===BareaHelper.DIR_SHOW)      
            directive.element.style.display = boundvalue ? "" : "none";
        else if (directive.directivename===BareaHelper.DIR_IF) 
        {
          this.#setComputedIf(directive, boundvalue);
        }
        else if (directive.directivename===BareaHelper.DIR_CLASS_IF) 
        {
            let truevalue = directive.directivevalue;
            if (truevalue.includes('?'))
            truevalue=truevalue.split('?')[1];

          this.#setComputedClassIf(directive, boundvalue, truevalue);

        }    
              
    }

    #runBindHandler(verb, directive)
    {

        if (!directive.handlerpieces)
            directive.handlerpieces = BareaHelper.parseBareaFunctionCall(directive.handlername);

        let allparams = [];
        if (verb === BareaHelper.VERB_SET_UI)
            allparams = [verb, directive.element, directive.data[directive.key]];

        if (verb === BareaHelper.VERB_SET_DATA)
            allparams = [verb, directive.element, directive.data, directive.key];

        allparams.push(...directive.handlerpieces.params);

        if (this.#methods[directive.handlerpieces.functionName]) {
            this.#methods[directive.handlerpieces.functionName].apply(this, allparams);
        } else {
            console.warn(`Handler function '${directive.handlerpieces.functionName}' not found.`);
        }
    }

    #setComputedClassIf(directive, boundvalue, truevalue) 
    {
        let classnames = truevalue.split(/[\s,]+/);

        // Add classes if condition is true and remove if false
        if (boundvalue) {
            classnames.forEach(className => {
                if (!directive.element.classList.contains(className)) {
                     directive.element.classList.add(className); // Add class if not already present
                }
                });
        } 
        else 
        {
             classnames.forEach(className => {
                 if (directive.element.classList.contains(className)) {
                    directive.element.classList.remove(className); // Remove class if present
                }
            });
        }
    }

    #setComputedIf(directive, boundvalue) 
    {
        if (boundvalue)
        {
            if (!directive.element.parentNode)
                 if (directive.elementnextsibling)
                    directive.parentelement.insertBefore(directive.element, directive.elementnextsibling);
        }
        else
        {
            if (directive.element.parentNode)
            {
                directive.elementnextsibling = directive.element.nextSibling;
                directive.element.remove();
            }   
        }
    }

    #setInputText(directive) {
        if (directive.element && directive.element.value !== directive.data[directive.key]) 
        {
            if (!directive.data[directive.key])
                directive.element.value = "";
            else
                directive.element.value = directive.data[directive.key];
        }
    }

    #setInputCheckbox(directive) 
    {
        if (directive.element && directive.element.checked !== directive.data[directive.key]) 
        {
            if (!directive.data[directive.key])
                directive.element.checked = false;
            else
                directive.element.checked = directive.data[directive.key];
        }
    }

    #setInputRadio(directive)
    {
        if (directive.element && directive.element.type === 'radio' && directive.data[directive.key] !== undefined && directive.element.checked !== (directive.element.value === directive.data[directive.key])) 
        {
            directive.element.checked = directive.element.value === directive.data[directive.key];
        }
    }

    #setClass(directive) 
    {
        if (!directive.data[directive.key])
            return;

        if (!directive.orgvalue)
            directive.orgvalue="";
     
        let classes = directive.data[directive.key];
        if (classes.includes(','))
            classes = classes.replaceAll(',', ' ');
    
        directive.element.className = classes || directive.orgvalue;
    }

    #setSrc(directive) 
    {
        if (!directive.data[directive.key])
            return;
    
        directive.element.src = directive.data[directive.key];
    }

    #setHref(directive) 
    {
        if (!directive.data[directive.key])
            return;

        directive.element.href = directive.data[directive.key];
    }
    #setInterpolation(directive)
    {
 
        let interpolatednode = directive.interpolatednode;
        let nodetemplate = directive.nodetemplate;
        //We loop individual expressions if many in a node
        directive.nodeexpressions.forEach(ipstmt => 
        {

            let interpol_value = "";
            const attribute_value_type = this.#getExpressionType(ipstmt.directivevalue,BareaHelper.DIR_INTERPOLATION,directive.renderedvarname);
            if (attribute_value_type===BareaHelper.EXPR_TYPE_INVALID)
            {
                    console.error(`The ${BareaHelper.DIR_INTERPOLATION} directive has an invalid expression (${ipstmt.directivevalue}).`);
                    return;
            }
    
            if (attribute_value_type===BareaHelper.EXPR_TYPE_COMPUTED){
                interpol_value=this.#computedProperties[ipstmt.directivevalue].value;
            }else if ([BareaHelper.EXPR_TYPE_ROOT_PATH,BareaHelper.EXPR_TYPE_OBJREF,BareaHelper.EXPR_TYPE_OBJREF_PATH].includes(attribute_value_type))
            {
                if (ipstmt.key && ipstmt.data){
                    interpol_value = ipstmt.data[ipstmt.key];
                }else{
                    if (ipstmt.data)
                        interpol_value = ipstmt.data;
                } 
            }
            else if (attribute_value_type === BareaHelper.INTERPOL_INDEX)
            {
                interpol_value = String(directive.renderedindex);
            }
    
            if (!interpol_value)
                interpol_value ="";
    
            if (typeof interpol_value === "object") 
                interpol_value = JSON.stringify(interpol_value)

            nodetemplate = nodetemplate.replaceAll(ipstmt.expression, interpol_value);

        });
       
      
        interpolatednode.textContent = nodetemplate;
        
    }

    
    /**
     * Render templates = adding new stuf to the DOM
     * @param {string} path - The path affected when proxy updated.
     * @param {any} value - The value changed in the proxy.
     * @param {string} key - The key in the parent affected object.
     * @param {any} target - The parent object of what's changed.
     */
    #renderTemplates(template_directive, path='root', reasonarray, arrayfuncname, arrayfuncargs) 
    {
        let elementsRemoved = false;
        let fullReRender = false;
        let foreacharray = [];

        let [varname, datapath] = template_directive.directivevalue.split(" in ").map(s => s.trim());
        if (!varname)
        {
            console.error(`No variable name was found in the ${template_directive.directivename} expression`);
            return;
        }
        if (!datapath)
        {
            console.error(`No path or computed function was found in the ${template_directive.directivename} expression`);
            return;
        }

        let sourcetype = this.#getExpressionType(datapath, template_directive.directivename);
        if (sourcetype===BareaHelper.EXPR_TYPE_INVALID){
            console.error(`The expression for the directive ${template_directive.directivename} value: ${template_directive.directivevalue} is not valid`);
            return;
        }


        if (arrayfuncname && (arrayfuncname === 'shift' || arrayfuncname === 'pop' || arrayfuncname === 'splice'))
            elementsRemoved=true;    
        if (arrayfuncname && (arrayfuncname === 'sort' || arrayfuncname === 'reverse' || arrayfuncname === 'splice'))
            fullReRender = true;
        if (sourcetype===BareaHelper.EXPR_TYPE_COMPUTED)
            fullReRender = true;
        if (arrayfuncname && !BareaHelper.ARRAY_FUNCTIONS.includes(arrayfuncname))
            fullReRender = true;
        if (reasonarray && !arrayfuncname)
            fullReRender = true;

        if (sourcetype===BareaHelper.EXPR_TYPE_COMPUTED)
        {
            if (this.#computedProperties[datapath])
                foreacharray = this.#computedProperties[datapath].value;
            else
                console.warn(`Could not find computed function name in the ${template_directive.directivename} directive`);

        }
        else
        {
            if (reasonarray){
                foreacharray = reasonarray; 
            }else{
                foreacharray = this.getProxifiedPathData(datapath);
            }      
        }

      
        if (fullReRender)
        {
            let counter=0;
            this.#uiDependencyTracker.removeTemplateDependencies(template_directive.id);

            template_directive.parentelement.innerHTML = "";
            const fragment = document.createDocumentFragment();
            foreacharray.forEach(row => {
   
                let newItem = this.#getNewTemplateElement(template_directive, varname, row, counter);
                fragment.appendChild(newItem);
                this.#trackDirectives(newItem, {template:template_directive, rendereddata:row, renderedindex:counter, renderedvarname:varname, renderedobjid: this.#internalSystemCounter});
                counter++;
            });

            if (fragment.childElementCount>0)
                template_directive.parentelement.appendChild(fragment);  

        }
        else
        {
            if (arrayfuncname === "push" && arrayfuncargs) {
                arrayfuncargs.forEach(row => {
                    let newItem = this.#getNewTemplateElement(template_directive, varname, row,-1);
                    template_directive.parentelement.appendChild(newItem);
                });
            } 
            else if (arrayfuncname === "unshift" && arrayfuncargs) {
                arrayfuncargs.reverse().forEach(row => {
                    let newItem = this.#getNewTemplateElement(template_directive, varname, row,-1);
                    template_directive.parentelement.insertBefore(newItem,  template_directive.parentelement.firstChild);
                });
            }
            else if (arrayfuncname === "pop") {
                template_directive.parentelement.removeChild(template_directive.parentelement.lastChild);
            }
            else if (arrayfuncname === "shift") {
                template_directive.parentelement.removeChild(template_directive.parentelement.firstChild);
            }
               
            if (template_directive.usesReRenderedInterpolation)
            {
                let counter=0;
                foreacharray.forEach(row=>{
                    let directives = this.#uiDependencyTracker.getObjectDependencies(row, template_directive.id);
                    directives.forEach(dir =>{
                        if (dir.directivename === BareaHelper.DIR_INTERPOLATION && dir.isrendered)
                        {
                            dir.renderedindex=counter;
                            this.#setInterpolation(dir);
                            counter++; 
                        }
                    });    
                });
            }
 
        }

        if (elementsRemoved)
            this.#uiDependencyTracker.removeDeletedElementDependencies(template_directive.id);
        
    }

    #getNewTemplateElement(template, varname, row, index=-1)
    {
        this.#internalSystemCounter++;
        const newtag = document.createElement(template.templatetagname);
        newtag.innerHTML = template.templatemarkup;
       
        if (newtag.id)
            newtag.id = newtag.id + `-${this.#internalSystemCounter}` 
        else
            newtag.id = `${template.id}-${varname}-${this.#internalSystemCounter}`; 

        let templatechildren = newtag.querySelectorAll("*"); 
        templatechildren.forEach(child => 
        {
           
            if (child.id)
                child.id = child.id + `-${this.#internalSystemCounter}` 
            else
                child.id = `${varname}-${this.#internalSystemCounter}`; 

            let forattrib = child.getAttribute("for");
            if (forattrib)
                child.setAttribute("for", forattrib + `-${this.#internalSystemCounter}`); 
        
        });

        this.#trackDirectives(newtag, {template:template, rendereddata:row, renderedindex:index, renderedvarname:varname, renderedobjid: this.#internalSystemCounter});
        return newtag;
    }

   
    #getExpressionType = function(expression, directive, varname) 
    {
        if (BareaHelper.DIR_GROUP_BIND_TO_PATH.includes(directive))
        {
            if (expression.includes('(') || expression.includes(')'))
                return BareaHelper.EXPR_TYPE_INVALID;

            if (!(expression.includes('.')))
                return BareaHelper.EXPR_TYPE_INVALID;

            if (expression.toLowerCase().startsWith('root.'))
                return BareaHelper.EXPR_TYPE_ROOT_PATH;

            return BareaHelper.EXPR_TYPE_OBJREF_PATH;
        }

        if ([BareaHelper.DIR_CLICK, BareaHelper.DIR_BIND_HANDLER].includes(directive))
        {
            if (!(expression.includes('(') && expression.includes(')')))
                return BareaHelper.EXPR_TYPE_INVALID;

            return BareaHelper.EXPR_TYPE_HANDLER;
        }

        if (BareaHelper.DIR_GROUP_COMPUTED.includes(directive))
        {
            if (expression.includes('(') || expression.includes(')'))
                return BareaHelper.EXPR_TYPE_INVALID;

            if ((expression.includes('root.')))
            {
                if (varname && expression.includes(varname+'.'))
                    return BareaHelper.EXPR_TYPE_MIX_EXPR;

                return BareaHelper.EXPR_TYPE_ROOT_EXPR;
            }
            
            if (!(expression.includes('.')))
                return BareaHelper.EXPR_TYPE_COMPUTED;

            return BareaHelper.EXPR_TYPE_OBJREF_EXPR;
        }

        if (directive === BareaHelper.DIR_FOREACH)
        {
            if ((expression.includes('root.')))
                return BareaHelper.EXPR_TYPE_ROOT_PATH;

            if (!(expression.includes('.')))
                return BareaHelper.EXPR_TYPE_COMPUTED;

            return BareaHelper.EXPR_TYPE_INVALID;
        }

        if (directive === BareaHelper.DIR_INTERPOLATION)
        {
            if (expression.includes('(') || expression.includes(')'))
                return BareaHelper.EXPR_TYPE_INVALID;

            if (expression.toLowerCase() === (varname + '.' + BareaHelper.INTERPOL_INDEX))
                return BareaHelper.INTERPOL_INDEX;

            if (expression.toLowerCase().startsWith('root.'))
                return BareaHelper.EXPR_TYPE_ROOT_PATH;

            if (expression.includes('.'))
                return BareaHelper.EXPR_TYPE_OBJREF_PATH;

            if (this.#computedPropertyNames.includes(expression))
                return BareaHelper.EXPR_TYPE_COMPUTED;

            return BareaHelper.EXPR_TYPE_OBJREF;
        }

    
        return BareaHelper.EXPR_TYPE_INVALID;
    }

    #extractInterpolations(text) {
        const regex = /\{\{\s*.*?\s*\}\}/g;
        return text.match(regex) || [];
    }

    
    #isPrimitive(value)
    {
        let result = value !== null && typeof value !== "object" && typeof value !== "function";
        return result;
    }


    enableConsoleLog(id, active)
    {
        const logidx = this.#consoleLogs.findIndex(p=> p.id===id);
        if (logidx!== -1)
            this.#consoleLogs[logidx].active = active;
    }

    #getConsoleLog(id) 
    {
        const log = this.#consoleLogs.find(log => log.id === id);
        if (!log)
            return {id:-1, name:"", active:false};
        return log;
    }

    printConsoleLogs()
    {
      console.log('barea.js available logs:');
      this.#consoleLogs.forEach(p=> console.log(p));
    }

    #setConsoleLogs(){
        this.#consoleLogs = [
            {id: 1, name: "Proxy call back: ", active:false},
            {id: 2, name: "Update dom on proxy change: ", active:false},
            {id: 3, name: "Update proxy on user input: ", active:false},
            {id: 4, name: "Print UI dependency tracking: ", active:false},
            {id: 5, name: "Print computed dependency tracking: ", active:false}
        ];
    } 

    #loadedHandler =  (event) => {
       if (this.#enableHideUnloaded)
       {
            document.querySelectorAll(".ba-cloak").forEach(el => el.classList.remove("ba-cloak"));
       }
    }


    #getNewComputedProperty(func, funcname)
    {
        let instance = this;
        let computed_properties_tracker = this.#computedPropertiesDependencyTracker;
        let userinterface_tracker = this.#uiDependencyTracker;
        class BareaComputedProperty
        {
            userInterfaces = new Set();

            constructor(func, funcname) {
                this.name=funcname;
                this.getter = func;
                this.dirty = true;
                this.dependencyPaths = new Set();
                this.setDirty = (path) => {
                    this.dirty = true;
                    userinterface_tracker.notifyDependentUserInterface(this.userInterfaces);
                };
            }
        
            track(dep, path) {
                dep.addSubscriber(this.name, this.setDirty); //The computed property tells that tracker: Hi i'm a new subscriber
                this.dependencyPaths.add(path);
            }

            addDependentDirective(directive)
            {
                this.userInterfaces.add(directive);
            }
        
            get value() 
            {
                if (this.dirty) 
                {
                    computed_properties_tracker.start(this);
                    this._value = this.getter.call(instance);
                    computed_properties_tracker.stop();
                    this.dirty = false;
                }
                return this._value;
            }
        }

        return new BareaComputedProperty(func, funcname);
    }

    #getComputedPropertiesDependencyTracker()
    {
        let instance;

        class  ComputedPropertiesDependencyTracker
        {
            #dependencies = null;
            #activeComputed = null;

            constructor() 
            {
                if (instance)
                    return instance;

                this.#dependencies = new Map();
                instance = this;
            }
        
            start(computed) {
                this.#activeComputed  = computed;
            }
        
            stop() {
                this.#activeComputed  = null;
            }

            getAllDependencies()
            {
                return this.#dependencies;
            } 

            isDepencencyPath(path, funcname)
            {
                if (!path)
                    return false;
                if (!funcname)
                    return false;

                if (!this.#dependencies.has(path))
                    return false;

                for (let childKey of this.#dependencies.keys()) 
                {
                    if (childKey!==path)
                        continue;

                    let childMap = this.#dependencies.get(childKey); 
                
                    for (let key of childMap.subscribers.keys()) {
                        if (key===funcname) {
                            return true;
                        }
                    }
                }

                return false;
            }
        
            //Called on proxy change get
            //If a computed func is active on the singelton tracker
            //Look for a dependency or creates one for the computed func
            track(objpath, funcname) 
            {
                if (!objpath)
                    return;

                if (objpath===BareaHelper.ROOT_OBJECT)
                    return;

                let trackpath ="";
                if (funcname)
                    trackpath = objpath+'.'+funcname.toLowerCase();
                else
                    trackpath=objpath;

                if (this.#activeComputed) {
                    let dep = this.#getDependency(trackpath);
                    this.#activeComputed.track(dep, trackpath);
                }
            }

            /**
            * Called on proxy change (proxy handler set)
            * Sets computed properties dirty if the property is dependent on the objpath
            * Updates directives that are dependent on the computed property that becomes dirty
            * @param {string} objpath - The path in the data that was changed
            * @param {string} funcname - If a function was used on an array, the name of the function
            */
            notify(objpath, funcname) 
            {
                if (!objpath)
                    return;

                if (objpath===BareaHelper.ROOT_OBJECT)
                    return;

                let trackpath ="";
                if (funcname)
                    trackpath = objpath+'.'+funcname.toLowerCase();
                else
                    trackpath=objpath;


                let dep = this.#getDependency(trackpath);
                    dep.notify(trackpath);
            }

            #getDependency(path) 
            {
                let dep = this.#dependencies.get(path);
                if (!dep) {
                    dep = this.#createDependency(path);

                    this.#dependencies.set(path, dep);
                }

                return dep;
            }

            #createDependency(path) 
            {
                let subscribers = new Map();
                return {
                    subscribers : subscribers, 
                    addSubscriber(name, set_dirty_func) {
                        if (!subscribers.has(name))
                        {
                            subscribers.set(name, set_dirty_func);
                        }
                    },
                    notify(path) { 
                        subscribers.forEach((set_dirty_func, name) => {
                            set_dirty_func(path); 
                        });
                    }
                };
            }

        }

        return new ComputedPropertiesDependencyTracker();
    }

    #getUserInterfaceTracker(notifycallback)
    {
        let instance;
        let computedProperties = this.#computedProperties;
        class UserInterfaceTracker
        {
            #dependencies = new Map();
            #objectReference = new WeakMap();
            #notifycallback = null;
            #objectCounter=0;
            #trackingCalls=0;
            #notificationCalls=0;

            constructor(notifycallback) 
            {
                if (instance)
                    return instance;

                this.#notifycallback = notifycallback;
                instance = this;
            }

            #getObjectId(obj) 
            {
                let isnewobj = false;
                let retval = 0;
                if (!this.#objectReference.has(obj)) 
                {
                    isnewobj=true;
                    this.#objectReference.set(obj, ++this.#objectCounter); // Assign a new ID
                }
                retval = this.#objectReference.get(obj);
                return {id:retval, isnew:isnewobj};
            }

            removeTemplateDependencies(templateid=-1)
            {
                let keystodelete = [];
                this.#dependencies.forEach((value, key) => 
                {
                    for (const directive of value) 
                    {
                        if (directive.template && directive.template.id===templateid && templateid!==-1)
                            keystodelete.push(key);
                    }       
                });

                for (let i = 0; i < keystodelete.length-1; i++)
                    this.#dependencies.delete(keystodelete[i]);

                //Remove directive:s from computed functions too
                Object.keys(computedProperties).forEach(key => {
                    //Create an array before deleting in the set
                    for (let directive of [...computedProperties[key].userInterfaces]) {
                        if (directive.template && directive.template.id===templateid)
                            computedProperties[key].userInterfaces.delete(directive);
                    }
                });

            }

            removeDeletedElementDependencies(templateid=-1){

                let keystodelete = [];
                this.#dependencies.forEach((value, key) => 
                {
                    for (const directive of value) 
                    {
                        if (directive.template && directive.template.id===templateid && templateid!==-1 && directive.element && !directive.element.isConnected)
                            keystodelete.push(key);
                    }       
                });

                for (let i = 0; i < keystodelete.length-1; i++)
                    this.#dependencies.delete(keystodelete[i]);

                //Remove directive:s from computed functions too
                Object.keys(computedProperties).forEach(key => {
                    //Create an array before deleting in the set
                    for (let directive of [...computedProperties[key].userInterfaces]) {
                        if (directive.template && directive.template.id===templateid && directive.element && !directive.element.isConnected)
                            computedProperties[key].userInterfaces.delete(directive);
                    }
                });

            }

            getObjectDependencies(object, templateid=-1)
            {
                let directives = [];
                this.#dependencies.forEach((value, key) => 
                {
                    for (const directive of value) 
                    {
                        if (directive.template && directive.data && directive.template.id===templateid && Object.is(directive.data, object)) 
                            directives.push(directive);  
                    }
                });

               return directives;

            }

            getAllDependencies()
            {
                return this.#dependencies;
            } 

            track(scope, directive) 
            {
                this.#trackingCalls++;

                if (!directive.data && !directive.isrendered && !BareaHelper.DIR_GROUP_MARKUP_GENERATION.includes(directive.directivename))
                    console.error(`Tracked UI has no data`,directive);

                if (BareaHelper.DIR_GROUP_COMPUTED.includes(directive.directivename))
                    return;

                const object = directive.data;
              
                let depKey="";
                if (scope==='value')
                {
                    depKey = this.#getObjectId(object).id + ":value:" + directive.key; 
                }
                else if (scope==='object')
                {
                    depKey = this.#getObjectId(object).id + ":object:"; 
                }else{
                    depKey=scope;                   
                }

                if (!depKey)
                    return false;
                
                if (!this.#dependencies.has(depKey)) 
                {
                    this.#dependencies.set(depKey, new Set());
                }
                this.#dependencies.get(depKey).add(directive);

                return true;

            }

            notify(path, reasonobj, reasonkey, reasonvalue, reasonfuncname) 
            {
                this.#notificationCalls++;

                let objid = this.#getObjectId(reasonobj);
                if (!objid.isnew)
                {
                    let depKey = objid.id + ":value:" + reasonkey;
                    let valueset = this.#dependencies.get(depKey);
                    if (!valueset)
                        valueset= new Set();

                    depKey = objid.id + ":object:";
                    let objectset = this.#dependencies.get(depKey);
                    if (!objectset)
                        objectset= new Set();

                    let resultset = new Set([...valueset, ...objectset]);
                    if (resultset.size===0)
                        return;
    
                    this.#notifycallback(reasonobj, reasonkey, reasonvalue, path, resultset, reasonfuncname);
                }
                else
                {
                  console.warn('UI dependency tracker was notified of an object that was not tracked', reasonobj);
                }
              
            }

            notifyDependentUserInterface(uiset) 
            {
                if (uiset)
                {
                    this.#notifycallback(null, "", null, "", uiset, "");
                }
            }
           

        }

        return new UserInterfaceTracker(notifycallback);
    
    }


}



class BareaHelper
{

    //Directives
    static DIR_BIND = 'ba-bind';
    static DIR_BIND_BLUR = 'ba-bind-blur';
    static DIR_BIND_HANDLER  = 'ba-bind-handler';
    static DIR_FOREACH = 'ba-foreach';
    static DIR_CLICK = 'ba-click';
    static DIR_CLASS = 'ba-class';
    static DIR_CLASS_IF = 'ba-class-if';
    static DIR_HIDE = 'ba-hide';
    static DIR_SHOW = 'ba-show';
    static DIR_IMAGE_SRC = 'ba-src';
    static DIR_IF = 'ba-if';
    static DIR_HREF = 'ba-href';
    static DIR_INTERPOLATION = 'interpolation';

    static DIR_GROUP_BIND_TO_PATH = [BareaHelper.DIR_BIND,BareaHelper.DIR_BIND_BLUR,BareaHelper.DIR_CLASS,BareaHelper.DIR_HREF,BareaHelper.DIR_IMAGE_SRC];
    static DIR_GROUP_UI_DUPLEX = [BareaHelper.DIR_BIND,BareaHelper.DIR_BIND_BLUR];
    static DIR_GROUP_TRACK_AND_FORGET = [BareaHelper.DIR_CLICK];
    static DIR_GROUP_COMPUTED = [BareaHelper.DIR_CLASS_IF,BareaHelper.DIR_HIDE,BareaHelper.DIR_SHOW, BareaHelper.DIR_IF];
    static DIR_GROUP_MARKUP_GENERATION = [BareaHelper.DIR_FOREACH];

    static UI_INPUT_TEXT = 1;
    static UI_INPUT_CHECKBOX = 2;
    static UI_INPUT_RADIO = 3;
    static UI_INPUT_CUSTOM = 4;


    //Verbs
    static VERB_SET_DATA = 'SET_DATA';
    static VERB_SET_UI = 'SET_UI';


    //Dom meta data
    static META_PATH = 'ba-path';
    static META_DYN_FUNC_PREFIX = 'dynFunc_';
    static META_DYN_TEMPLATE_FUNC_PREFIX = 'dynTemplFunc_';


    //Special interpolation expressions
    static INTERPOL_INDEX = 'index';


    //Expression types
    static EXPR_TYPE_ROOT_PATH = 'root-path';
    static EXPR_TYPE_HANDLER = 'static-handler';
    static EXPR_TYPE_COMPUTED = 'computed';
    static EXPR_TYPE_OBJREF = 'child-obj';
    static EXPR_TYPE_OBJREF_PATH = 'child-obj-path';
    static EXPR_TYPE_OBJREF_EXPR = 'child-obj-expression';
    static EXPR_TYPE_ROOT_EXPR = 'root-expr';
    static EXPR_TYPE_MIX_EXPR = 'root-and-child-expression';
    static EXPR_TYPE_INVALID = 'invalid-expression';

    //The root of your data
    static ROOT_OBJECT = 'root';

    //Array functions to handle in the proxy
    static ARRAY_FUNCTIONS = ['push', 'pop', 'splice', 'shift', 'unshift','reverse','sort']; 

    static getLastBareaKeyName = function(path)
    {
        if (!path)
            return 'root';

        let keys = path.split('.');

        if (keys.length<2)
            return 'root';
    
        let key = "";
        keys.forEach(t=>{key=t});
        return key;
    }

    static getLastBareaObjectName = function(path)
    {
        if (!path)
            return 'root';

        let retval = null;
        let keys = path.split('.');
        for (let i = 0; i < keys.length-1; i++) 
        {
        
            if (!retval)
                retval=keys[i]
            else
                retval+='.'+keys[i];

        };

        if (retval==null)
            retval = path;
        
        return retval;
    }

    static parseBareaFunctionCall = function(str) 
    {
        function convertValue(val) {
            if (/^["'].*["']$/.test(val)) return val.slice(1, -1); // Remove quotes
            if (val === "true") return true;
            if (val === "false") return false;
            if (val === "null") return null;
            if (!isNaN(val)) return val.includes(".") ? parseFloat(val) : parseInt(val, 10);
            if (/^\[.*\]$/.test(val)) return val.slice(1, -1).split(',').map(item => convertValue(item.trim()));
            return val;
        }

        const match = str.match(/^(\w+)\((.*)\)$/);
        if (!match) return null;

        const [_, functionName, paramsString] = match;
        const params = paramsString.trim() 
            ? [...paramsString.matchAll(/'[^']*'|"[^"]*"|[^,]+/g)].map(m => convertValue(m[0].trim())) 
            : [];

        return { functionName, params };
    }

    static hasAnyChar = function(str, chars) 
    {
        return chars.some(char => str.includes(char));
    }

}



