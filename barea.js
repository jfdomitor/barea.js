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
    #enableInterpolation = true;
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
        this.#detectElements();
      

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

    enableInterpolation(value)
    {
        if (this.#isPrimitive(value))
            this.#enableInterpolation = value;
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

                    //Don't proxy the array, only objects, then function will not be found
                    // if (!Array.isArray(value)) {
                    //     return this.#createReactiveProxy(callback, value, newPath); 
                    // } else {
       
                    //     value.forEach((item, index) => {
                    //         if (typeof item === "object" && item !== null) {
                    //             return this.#createReactiveProxy(callback, item, newPath); 
                    //         }
                    //     });
                    // }

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

                                    //let proxiedArgs = args.map(arg => this.#makeReactive.call(this, callback, arg, currentpath));
                                    //const result = Array.prototype[value.name].apply(target, args);

                                    // let proxiedArgs = args.map(arg => 
                                    //     (typeof arg === "object" && arg !== null) ? this.#createReactiveProxy(callback, arg) : arg
                                    // );
                    
                                    //const result = Array.prototype[value.name].apply(target, proxiedArgs);
                                    const result = value.apply(target, args); 

                                    this.#computedPropertiesDependencyTracker.notify(currentpath, value.name);

                                    callback(currentpath, receiver, '', args, value.name);

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

    /***UI TRACKING ***/
    #detectElements(tag=this.#appElement, templateid=-1, templatedata, templatekey)
    {
        //Delete dynamic functions that was created along with the templates
        //this.#computedPropertiesDependencyTracker.deleteDynamicTemplateFunctions();

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
                        if (attribute_value_type==='INVALID')
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

                        let tracking_obj = this.#createInputDirective(templateid,el,attr.name,attr.value,null,"",systeminput);
                
                        //If root is included in the attr.value, example root.model.users.name
                        //Then we will bind to the root even if this is a template node
                        if (!templatedata || attr.value.startsWith(BareaHelper.ROOT_OBJECT)){
                            let objpath = BareaHelper.getLastBareaObjectName(attr.value);
                            tracking_obj.data=this.getProxifiedPathData(objpath);
                            tracking_obj.key=BareaHelper.getLastBareaKeyName(attr.value);
                        }else{
                            tracking_obj.data=templatedata;
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
                            if (check_handler==='INVALID')
                            {
                                console.error(`The ${BareaHelper.DIR_BIND_HANDLER} directive has an invalid value (${handlername}), should be funcname(), or funcname(args..).`);
                                return;
                            }

                            tracking_obj.hashandler=true;
                            tracking_obj.handlername=handlername;
                        
                        }
                        
                        
                        this.#uiDependencyTracker.track('value', tracking_obj);

                            if (BareaHelper.DIR_GROUP_UI_DUPLEX.includes(tracking_obj.directive))
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

                                let eventtype = (tracking_obj.directive===BareaHelper.DIR_BIND) ? "input" : "blur";
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
                            else if (tracking_obj.directive===BareaHelper.DIR_CLASS){
                                let classnames = el.getAttribute('classNames');
                                tracking_obj.orgvalue=classnames;
                                this.#setClass(tracking_obj);
                            }
                            else if (tracking_obj.directive===BareaHelper.DIR_HREF){
                                this.#setHref(tracking_obj);
                            }
                            else if (tracking_obj.directive===BareaHelper.DIR_IMAGE_SRC){
                                this.#setSrc(tracking_obj);
                            }
                          
                            
                    }
                    else if (BareaHelper.DIR_GROUP_COMPUTED.includes(attr.name))
                    {

                        const genMarkup = el.getAttribute(BareaHelper.META_IS_GENERATED_MARKUP);
                        const varname = el.getAttribute(BareaHelper.META_ARRAY_VARNAME);
                        const attribute_value_type = this.#getExpressionType(attr.value, attr.name, varname);
                        if (attribute_value_type==='INVALID')
                         {
                            console.error(`Then ${attr.name} directive has an invalid value (${attr.value}).`);
                            return;
                        }
    
                        let condition = attr.value.trim();
                        if (condition.includes('?'))
                            condition = condition.split('?')[0];

                        
                        let isnewhandler = false;
                        let handlername = this.#dynamicExpressionRegistry.get(attr.value);
                        if (!handlername || attribute_value_type !== BareaHelper.EXPR_TYPE_ROOT_EXPR)
                        {
                            isnewhandler=true;
                            if (genMarkup){
                                handlername = `${BareaHelper.META_DYN_TEMPLATE_FUNC_PREFIX}${this.#internalSystemCounter}`;
                            }else{
                                handlername = `${BareaHelper.META_DYN_FUNC_PREFIX}${this.#internalSystemCounter}`;
                            }
                            this.#dynamicExpressionRegistry.set(attr.value, handlername);
                        }

                        const tracking_obj = this.#createComputedDirective(templateid,el,attr.name,attr.value);

                        //If root expression force root data to be executed
                        if (!templatedata){
                            tracking_obj.data=this.#appDataProxy;
                        }else{
                            tracking_obj.data=templatedata;
                        }
                        tracking_obj.key="";
                       
                        if (attr.name === BareaHelper.DIR_IF){
                            tracking_obj.elementnextsibling=el.nextSibling;
                            tracking_obj.parentelement=el.parentElement;
                        }
            
                        if (attribute_value_type === BareaHelper.EXPR_TYPE_COMPUTED)
                        {
                            tracking_obj.handlername=condition;
                            this.#computedProperties[tracking_obj.handlername].addDependenUserInterface(tracking_obj);
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
                            this.#computedProperties[tracking_obj.handlername].addDependenUserInterface(tracking_obj);
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
                                
                                condition=condition.replaceAll(varname+'.','contextdata.');
                                return evalObjExpr(condition, tracking_obj.data);
                            }

                            if (!varname)
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
                            this.#computedProperties[tracking_obj.handlername].addDependenUserInterface(tracking_obj);
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
                                condition=condition.replaceAll(varname+'.','subdata.');
                                return evalMixedExpr(condition, subobj,rootobj);
                            }

                            if (!varname)
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
                            this.#computedProperties[tracking_obj.handlername].addDependenUserInterface(tracking_obj);
                            this.#runComputedFunction(tracking_obj);
                        
                        }
                        
                    }
                    else if (BareaHelper.DIR_GROUP_TRACK_AND_FORGET.includes(attr.name))
                    {
                        const attribute_value_type = this.#getExpressionType(attr.value, attr.name);
                        if (attribute_value_type==='INVALID')
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
                                    if (templatedata)
                                         eventdata = templatedata;
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
                        if (attribute_value_type==='INVALID')
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
        
                        const tracking_obj = this.#createTemplateDirective(templateid,el,attr.name,attr.value,null,"", el.parentElement,templateHtml, el.localName);
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
                            this.#computedProperties[datapath].addDependenUserInterface(tracking_obj);
                            this.#uiDependencyTracker.track('computed', tracking_obj);
                        }

                        this.#renderTemplates(tracking_obj);
                          
                    }
                  

                });                 

        });

        //Interpolation is detected in text nodes {{interplation}}
        if (this.#enableInterpolation)
        {
            function traverseNodes(node, instance) {
                if (node.nodeType === Node.TEXT_NODE) 
                {
                    if (node.nodeValue.includes("{{") && node.nodeValue.includes("}}"))
                    {
                        let nodeexpressions=[];
                        let expressions = instance.#extractInterpolations(node.nodeValue);
                        expressions.forEach(expr=>{

                            let path = expr.replaceAll('{','').replaceAll('}','').trim();
                            const attribute_value_type = instance.#getExpressionType(path,BareaHelper.DIR_INTERPOLATION);
                            if (attribute_value_type==='INVALID')
                            {
                                console.error(`The ${DIR_INTERPOLATION} directive has an invalid expression (${path}).`);
                                return;
                            }

                            let tracking_obj = instance.#createInterpolationDirective(templateid,BareaHelper.DIR_INTERPOLATION,path,null,"",node, expr, node.nodeValue);
                            if (attribute_value_type===BareaHelper.EXPR_TYPE_COMPUTED){
                                tracking_obj.iscomputed = true;
                                nodeexpressions.push(tracking_obj);
                            }
                            else if ([BareaHelper.EXPR_TYPE_ROOT_PATH,BareaHelper.EXPR_TYPE_OBJREF,BareaHelper.EXPR_TYPE_OBJREF_PATH,BareaHelper.INTERPOL_INDEX].includes(attribute_value_type))
                            {
                                //Find data
                                let objpath=BareaHelper.ROOT_OBJECT;
                                if (!templatedata || path.startsWith(BareaHelper.ROOT_OBJECT)){
                                    objpath = BareaHelper.getLastBareaObjectName(path);
                                    tracking_obj.data=instance.getProxifiedPathData(objpath);
                                }else{
                                    tracking_obj.data = templatedata;
                                }

                                //Find key
                                tracking_obj.key="";
                                let interpolation_key = BareaHelper.getLastBareaKeyName(path);
                                if (interpolation_key!==BareaHelper.OBJECT && interpolation_key!==objpath){
                                    tracking_obj.key=interpolation_key;
                                }

                                tracking_obj.iscomputed = false;
                                nodeexpressions.push(tracking_obj);
                          
                            }
                            
                        });  
                        
                        if (nodeexpressions.length>0)
                        {
                            //Important must render per node so multiple expressions in one node leads to double tracking
                            nodeexpressions.forEach(ne=>{
                                ne.nodeexpressions = nodeexpressions;
                                if (ne.iscomputed){
                                    instance.#computedProperties[ne.directivevalue].addDependenUserInterface(ne);
                                }else if (ne.key){
                                    instance.#uiDependencyTracker.track('value', ne);
                                }else if  (ne.data) {
                                    instance.#uiDependencyTracker.track('object', ne);
                                }

                                instance.#setInterpolation(ne);

                            }); 
                         
                        }
                       
                    }
                }
                
                for (let child of node.childNodes) {
                    traverseNodes(child, instance);
                }
            }
            
            traverseNodes(tag, this);

        }

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
                //templateroot._isInvalidTemplate = true;
                isValidTemplate = false;
            }
            if (!datapath){
                isValidTemplate=false;
                console.error(`No path or computed function was found in the ${BareaHelper.DIR_FOREACH} expression: ${templateattr}`);
                //templateroot._isInvalidTemplate = true;
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

    #createComputedDirective(templateid, element, directive, directivevalue)
    {
        let id = this.#internalSystemCounter++;
        return {id: id, isnew:true, templateid: templateid, directive:directive,  directivevalue:directivevalue, element: element, data:null, key:"", hashandler:false, handlername:"", inputtype:-1, iscomputed:true };
    }

    #createInputDirective(templateid, element, directive, directivevalue, data, key, inputtype)
    {
        let id = this.#internalSystemCounter++;
        return {id: id, isnew:true, templateid: templateid, directive:directive,  directivevalue:directivevalue, element: element, data:data, key:key, hashandler:false, handlername:"", inputtype:inputtype,iscomputed:false };
    }
    #createTemplateDirective(templateid, element, directive, directivevalue, data, key,  parentelement, templatemarkup, templatetagname)
    {
        let id = this.#internalSystemCounter++;
        return {id: id, isnew:true, templateid: templateid, directive:directive,  directivevalue:directivevalue, element: element, data:data, key:key, hashandler:false, handlername:"", inputtype:-1, iscomputed:false, parentelement : parentelement, templatemarkup : templatemarkup, templatetagname : templatetagname };
    }
    #createInterpolationDirective(templateid, directive, directivevalue, data, key,interpolatednode, expression, nodetemplate)
    {
        let id = this.#internalSystemCounter++;
        return {id: id, isnew:true, templateid: templateid, directive:directive,  directivevalue:directivevalue, element: null, data:data, key:key, hashandler:false, handlername:"", inputtype:-1, iscomputed:false, interpolatednode: interpolatednode, expression: expression, nodetemplate:nodetemplate, nodeexpressions:[]  };
    }

    #handleUITrackerNofify = (reasonobj, reasonkey, reasonvalue, path, resultset, arrayfuncargs) =>
    {
        resultset.forEach(ui => 
        {
            if (BareaHelper.DIR_GROUP_BIND_TO_PATH.includes(ui.directive)){

                    if (ui.hashandler){
                        this.#runBindHandler(BareaHelper.VERB_SET_UI, ui);
                        return;
                    }

                    if (BareaHelper.DIR_GROUP_UI_DUPLEX.includes(ui.directive))
                    {
                        if (ui.inputType === BareaHelper.UI_INPUT_TEXT){
                            this.#setInputText(ui);
                        }
                        else if (ui.inputType === BareaHelper.UI_INPUT_CHECKBOX){
                            this.#setInputCheckbox(ui);
                        }
                        else if (ui.inputType === BareaHelper.UI_INPUT_RADIO){
                            this.#setInputRadio(ui);
                        }
                    }
                    else if (ui.directive===BareaHelper.DIR_CLASS){
                        this.#setClass(ui);
                    }
                    else if (ui.directive===BareaHelper.DIR_HREF){
                        this.#setHref(ui);
                    }
                    else if (ui.directive===BareaHelper.DIR_IMAGE_SRC){
                        this.#setSrc(ui);
                    }
                    
                    
            }
            else if (ui.directive===BareaHelper.DIR_INTERPOLATION){

                this.#setInterpolation(ui);
            }   
            else if (BareaHelper.DIR_GROUP_MARKUP_GENERATION.includes(ui.directive)){

                this.#renderTemplates(ui, path, reasonvalue, arrayfuncargs);  
            }
            else if (BareaHelper.DIR_GROUP_COMPUTED.includes(ui.directive))
            {
                if (path)
                {
                    let principalpath = BareaHelper.getPrincipalBareaPath(path);
                    if (!this.#computedPropertiesDependencyTracker.isDepencencyPath(principalpath, ui.handlername) && path !== BareaHelper.ROOT_OBJECT)
                        return;
                }
                this.#runComputedFunction(ui);
            }
        });
    }

    
  
    #runComputedFunction(ui)
    {

        let handlername = ui.handlername;
        let boundvalue = false;
        if (this.#computedProperties[handlername]) {
                boundvalue = this.#computedProperties[handlername].value;
        } else {
            console.warn(`Computed boolean function '${handlername}' not found.`);
        }
        
        if (ui.directive===BareaHelper.DIR_HIDE)
            ui.element.style.display = boundvalue ? "none" : ""
        else if (ui.directive===BareaHelper.DIR_SHOW)      
            ui.element.style.display = boundvalue ? "" : "none";
        else if (ui.directive===BareaHelper.DIR_IF) 
        {
          this.#setComputedIf(ui, boundvalue);
        }
        else if (ui.directive===BareaHelper.DIR_CLASS_IF) 
        {
            let truevalue = ui.directivevalue;
            if (truevalue.includes('?'))
            truevalue=truevalue.split('?')[1];

          this.#setComputedClassIf(ui, boundvalue, truevalue);

        }    
              
    }

    #runBindHandler(verb, ui)
    {

        if (!ui.handlerpieces)
            ui.handlerpieces = BareaHelper.parseBareaFunctionCall(ui.handlername);

        let allparams = [];
        if (verb === BareaHelper.VERB_SET_UI)
            allparams = [verb, ui.element, ui.data[ui.key]];

        if (verb === BareaHelper.VERB_SET_DATA)
            allparams = [verb, ui.element, ui.data, ui.key];

        allparams.push(...ui.handlerpieces.params);

        if (this.#methods[ui.handlerpieces.functionName]) {
            this.#methods[ui.handlerpieces.functionName].apply(this, allparams);
        } else {
            console.warn(`Handler function '${ui.handlerpieces.functionName}' not found.`);
        }
    }

    #setComputedClassIf(ui, boundvalue, truevalue) 
    {
        let classnames = truevalue.split(/[\s,]+/);

        // Add classes if condition is true and remove if false
        if (boundvalue) {
            classnames.forEach(className => {
                if (!ui.element.classList.contains(className)) {
                     ui.element.classList.add(className); // Add class if not already present
                }
                });
        } 
        else 
        {
             classnames.forEach(className => {
                 if (ui.element.classList.contains(className)) {
                    ui.element.classList.remove(className); // Remove class if present
                }
            });
        }
    }

    #setComputedIf(ui, boundvalue) 
    {
        if (boundvalue)
        {
            if (!ui.element.parentNode)
                 if (ui.elementnextsibling)
                    ui.parentelement.insertBefore(ui.element, ui.elementnextsibling);
        }
        else
        {
            if (ui.element.parentNode)
            {
                ui.elementnextsibling = ui.element.nextSibling;
                ui.element.remove();
            }   
        }
    }

    #setInputText(ui) {
        if (ui.element && ui.element.value !== ui.data[ui.key]) 
        {
            if (!ui.data[ui.key])
                ui.element.value = "";
            else
                ui.element.value = ui.data[ui.key];
        }
    }

    #setInputCheckbox(ui) 
    {
        if (ui.element && ui.element.checked !== ui.data[ui.key]) 
        {
            if (!ui.data[ui.key])
                ui.element.checked = false;
            else
                ui.element.checked = ui.data[ui.key];
        }
    }

    #setInputRadio(ui)
    {
        if (ui.element && ui.element.type === 'radio' && ui.data[ui.key] !== undefined && ui.element.checked !== (ui.element.value === ui.data[ui.key])) 
        {
            ui.element.checked = ui.element.value === ui.data[ui.key];
        }
    }

    #setClass(ui) 
    {
        if (!ui.data[ui.key])
            return;

        if (!ui.orgvalue)
            ui.orgvalue="";
     
        let classes = ui.data[ui.key];
        if (classes.includes(','))
            classes = classes.replaceAll(',', ' ');
    
        ui.element.className = classes || ui.orgvalue;
    }

    #setSrc(ui) 
    {
        if (!ui.data[ui.key])
            return;
    
        ui.element.src = ui.data[ui.key];
    }

    #setHref(ui) 
    {
        if (!ui.data[ui.key])
            return;

        ui.element.href = ui.data[ui.key];
    }
    #setInterpolation(ui)
    {
 
        let interpolatednode = ui.interpolatednode;
        let nodetemplate = ui.nodetemplate;
        //We loop individual expressions if many in a node
        ui.nodeexpressions.forEach(ipstmt => 
        {

            let interpol_value = "";
            const attribute_value_type = this.#getExpressionType(ipstmt.directivevalue,BareaHelper.DIR_INTERPOLATION);
            if (attribute_value_type==='INVALID')
            {
                    console.error(`The ${BareaHelper.DIR_INTERPOLATION} directive has an invalid expression (${ipstmt.directivevalue}).`);
                    return;
            }
    
            if (attribute_value_type===BareaHelper.EXPR_TYPE_COMPUTED){
                interpol_value=this.#computedProperties[ipstmt.directivevalue].value;
            }else if (attribute_value_type===BareaHelper.EXPR_TYPE_ROOT_PATH || attribute_value_type===BareaHelper.EXPR_TYPE_OBJREF || attribute_value_type===BareaHelper.EXPR_TYPE_OBJREF_PATH)
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
                interpol_value = this.#getClosestAttribute(interpolatednode.parentElement, BareaHelper.META_ARRAY_INDEX);
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
    #renderTemplates(ui, path='root', reasonvalue, arrayfuncargs) 
    {
        let alwayRerender = true;
        let foreacharray = [];
     

            let [varname, datapath] = ui.directivevalue.split(" in ").map(s => s.trim());
            if (!varname)
            {
                console.error(`No variable name was found in the ${ui.directive} expression`);
                return;
            }
            if (!datapath)
            {
                console.error(`No path or computed function was found in the ${ui.directive} expression`);
                return;
            }

            if (this.#getExpressionType(datapath, ui.directive)===BareaHelper.EXPR_TYPE_COMPUTED)
            {
                //If computed function always rerender
                alwayRerender=true;

                if (this.#computedProperties[datapath])
                    foreacharray = this.#computedProperties[datapath].value;
                else
                    console.warn(`Could not find computed function name in the ${ui.directive} directive`);

            }
            else
            {
                //If a new array is assigned always rerender
                if (Array.isArray(reasonvalue) || (this.#isPrimitive(reasonvalue) && (reasonvalue === 'sort' || reasonvalue === 'reverse')))
                    alwayRerender= true;
             
                //If not an assigned array or function on an array, skip
                if (!(Array.isArray(reasonvalue) || (this.#isPrimitive(reasonvalue) && BareaHelper.ARRAY_FUNCTIONS.includes(reasonvalue))))
                    return;

               
                foreacharray = this.getProxifiedPathData(datapath); 
            }

          
            if (!Array.isArray(foreacharray)){
                console.error('Could not get array in renderTemplates, should not happen if there is a god');
                return; 
            }
               

            //Re render template every time notified
           let counter=0;
           if (alwayRerender)
           {
                //Clean all dependencies on templateid
                this.#uiDependencyTracker.removeTemplateDependencies(ui.id);

                ui.parentelement.innerHTML = "";
                const fragment = document.createDocumentFragment();
                foreacharray.forEach(row => {
                    this.#internalSystemCounter++;
                    const newtag = document.createElement(ui.templatetagname);
                    newtag.innerHTML = ui.templatemarkup;
                    newtag.setAttribute(BareaHelper.META_ARRAY_VARNAME, varname);
                    newtag.setAttribute(BareaHelper.META_ARRAY_INDEX, counter);
                    newtag.setAttribute(BareaHelper.META_IS_GENERATED_MARKUP, true);

                    if (newtag.id)
                        newtag.id = newtag.id + `-${this.#internalSystemCounter}` 
                    else
                        newtag.id = `${ui.id}-${varname}-${this.#internalSystemCounter}`; 

                    fragment.appendChild(newtag);
                
                    //Mark the children for easier tracking
                    let templatechildren = newtag.querySelectorAll("*"); 
                    templatechildren.forEach(child => 
                    {
                        child.setAttribute(BareaHelper.META_ARRAY_VARNAME, varname);
                        child.setAttribute(BareaHelper.META_ARRAY_INDEX, counter);
                        child.setAttribute(BareaHelper.META_IS_GENERATED_MARKUP, true);

                        if (child.id)
                            child.id = child.id + `-${this.#internalSystemCounter}` 
                        else
                            child.id = `${varname}-${this.#internalSystemCounter}`; 

                        let forattrib = child.getAttribute("for");
                        if (forattrib)
                            child.setAttribute("for", forattrib + `-${this.#internalSystemCounter}`); 
                    
                    });

                    this.#detectElements(newtag, ui.id, row, "");
                    counter++;
                });

                if (fragment.childElementCount>0)
                    ui.parentelement.appendChild(fragment);  

                BareaHelper.ARRAY_FUNCTIONS.forEach(f=>
                {
                    this.#uiDependencyTracker.track('object', ui, foreacharray, f);
                });

            }
            else
            {
            
               

                if (reasonvalue === "push" && arrayfuncargs) {
                    arrayfuncargs.forEach(item => {
                        let newItem = this.#getTemplateElement(ui, varname, item);
                        ui.parentelement.appendChild(newItem); // Only append, no full re-render
                    });
                } 
                else if (reasonvalue === "unshift" && arrayfuncargs) {
                    arrayfuncargs.reverse().forEach(item => {
                        let newItem = this.#getTemplateElement(ui, varname, item);
                        ui.parentelement.insertBefore(newItem,  ui.parentelement.firstChild);
                    });
                }
                else if (reasonvalue === "pop") {
                    this.#uiDependencyTracker.removeDependency(arrayfuncargs[0]);
                    ui.parentelement.removeChild( ui.parentelement.lastChild);
                }
                else if (reasonvalue === "shift") {
                    this.#uiDependencyTracker.removeDependency(arrayfuncargs[0]);
                    ui.parentelement.removeChild( ui.parentelement.firstChild);
                }
                else if (reasonvalue === "splice" && arrayfuncargs) {
                    let [start, deleteCount, ...newItems] = arrayfuncargs;
                    let children = Array.from(ui.parentelement.children);
            
                    // Remove only the specified number of items
                    for (let i = 0; i < deleteCount; i++) {
                        this.#uiDependencyTracker.removeDependency(arrayfuncargs[i]);
                        if (children[start]) ui.parentelement.removeChild(children[start]);
                        
                    }
            
                    // Insert new items at the right position
                    newItems.reverse().forEach(item => {
                        let newItem = this.#getTemplateElement(ui, varname, item);
                        ui.parentelement.insertBefore(newItem,  ui.parentelement.children[start] || null);
                    });
                }
               

                let counter=0;
                foreacharray.forEach(row => 
                {
                    let deps = this.#uiDependencyTracker.getDependencies(row);
                    deps.forEach(ui=>{
                        ui.element.setAttribute(BareaHelper.META_ARRAY_INDEX, counter);
                        counter++;
                    });
                });
              
            }
        
    }

    #getTemplateElement(template, varname, row)
    {
        this.#internalSystemCounter++;
        const newtag = document.createElement(template.templatetagname);
        newtag.innerHTML = template.templatemarkup;
        newtag.setAttribute(BareaHelper.META_IS_GENERATED_MARKUP, true);
        newtag.setAttribute(BareaHelper.META_ARRAY_VARNAME, varname);
  

        if (newtag.id)
            newtag.id = newtag.id + `-${this.#internalSystemCounter}` 
        else
            newtag.id = `${template.id}-${varname}-${this.#internalSystemCounter}`; 

        let templatechildren = newtag.querySelectorAll("*"); 
        templatechildren.forEach(child => 
        {
            child.setAttribute(BareaHelper.META_IS_GENERATED_MARKUP, true);
            child.setAttribute(BareaHelper.META_ARRAY_VARNAME, varname);

            if (child.id)
                child.id = child.id + `-${this.#internalSystemCounter}` 
            else
                child.id = `${varname}-${this.#internalSystemCounter}`; 

            let forattrib = child.getAttribute("for");
            if (forattrib)
                child.setAttribute("for", forattrib + `-${this.#internalSystemCounter}`); 
        
        });

        this.#detectElements(newtag, template.id, row, "");
        return newtag;
    }

   

    /*** Internal Helpers ***/

    #getExpressionType = function(expression, directive, varname) 
    {
        if (BareaHelper.DIR_GROUP_BIND_TO_PATH.includes(directive))
        {
            if (expression.includes('(') || expression.includes(')'))
                return "INVALID";

            if (!(expression.includes('.')))
                return "INVALID";

            if (expression.toLowerCase().startsWith('root.'))
                return BareaHelper.EXPR_TYPE_ROOT_PATH;

            return BareaHelper.EXPR_TYPE_OBJREF_PATH;
        }

        if ([BareaHelper.DIR_CLICK, BareaHelper.DIR_BIND_HANDLER].includes(directive))
        {
            if (!(expression.includes('(') && expression.includes(')')))
                return "INVALID";

            return BareaHelper.EXPR_TYPE_HANDLER;
        }

        if (BareaHelper.DIR_GROUP_COMPUTED.includes(directive))
        {
            if (expression.includes('(') || expression.includes(')'))
                return "INVALID";

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

            return "INVALID";
        }

        if (directive === BareaHelper.DIR_INTERPOLATION)
        {
            if (expression.includes('(') || expression.includes(')'))
                return "INVALID";

            if (expression.toLowerCase() === BareaHelper.INTERPOL_INDEX)
                return BareaHelper.INTERPOL_INDEX;

            if (expression.toLowerCase().startsWith('root.'))
                return BareaHelper.EXPR_TYPE_ROOT_PATH;

            if (expression.includes('.'))
                return BareaHelper.EXPR_TYPE_OBJREF_PATH;

            if (this.#computedPropertyNames.includes(expression))
                return BareaHelper.EXPR_TYPE_COMPUTED;

            return BareaHelper.EXPR_TYPE_OBJREF;
        }

    
        return "INVALID";

    }

   
    #getClosestBareaObject(element)
    {
        if (element.hasOwnProperty("_bareaObject"))
            return element._bareaObject;

        let val=null;
        let p = element.parentElement;
        let safecnt=0;
        while (!val && p)
        {
            safecnt++;
            if (p.hasOwnProperty("_bareaObject"))
                val = p._bareaObject;

            p=p.parentElement;

            if (safecnt>10)
                break;
        }

        return val || null;
    }

    #getClosestAttribute(element, name)
    {
        let val = element.getAttribute(name);
        let p = element.parentElement;
        let safecnt=0;
        while (!val && p)
        {
            safecnt++;
            val = p.getAttribute(name);
            p=p.parentElement;
            if (safecnt>10)
                break;
        }
        return val || "";
    }

   
    #getInterpolationPaths(str) {
        const regex = /{{(.*?)}}/g;
        let matches = [];
        let match;
    
        while ((match = regex.exec(str)) !== null) {
            matches.push(match[1].trim()); // Trim spaces inside {{ }}
        }
    
        return matches;
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

    
    /*  Logging  */
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

    
                   
    /* Dom Handler */
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
                this.setDirty = (principalpath) => {
                    this.dirty = true;
                    userinterface_tracker.notifyDependentUserInterface(this.userInterfaces);
                };
            }
        
            track(dep, principalpath) {
                dep.addSubscriber(this.name, this.setDirty); //The computed property tells that tracker: Hi i'm a new subscriber
                this.dependencyPaths.add(principalpath);
            }

            addDependenUserInterface(ui)
            {
                this.userInterfaces.add(ui);
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

                let principalpath = BareaHelper.getPrincipalBareaPath(objpath);
                if (!principalpath)
                    return;

                if (principalpath===BareaHelper.ROOT_OBJECT)
                    return;

                if (funcname)
                    principalpath = principalpath+'.'+funcname.toLowerCase();

                if (this.#activeComputed) {
                    let dep = this.#getDependency(principalpath);
                    this.#activeComputed.track(dep, principalpath);
                }
            }

            //Called on proxy change set
            //Finds a dependency and notifies all subscribers
            notify(objpath, funcname) 
            {
                if (!objpath)
                    return;

                let principalpath = BareaHelper.getPrincipalBareaPath(objpath);
                if (!principalpath)
                    return;

                if (principalpath===BareaHelper.ROOT_OBJECT)
                    return;

                if (funcname)
                    principalpath = principalpath+'.'+funcname.toLowerCase();

                let dep = this.#getDependency(principalpath);
                    dep.notify(principalpath);
            }

            #getDependency(principalpath) 
            {
                let dep = this.#dependencies.get(principalpath);
                if (!dep) {
                    dep = this.#createDependency(principalpath);

                    this.#dependencies.set(principalpath, dep);
                }

                return dep;
            }

            #createDependency(principalpath) 
            {
                let subscribers = new Map();
                return {
                    subscribers : subscribers, 
                    addSubscriber(name, set_dirty_func) {
                        if (!subscribers.has(name))
                        {
                            subscribers.set(name, set_dirty_func);
                            //console.log(`${name} is subscribing to path: ${principalpath}`);
                        }
                    },
                    notify(principalpath) { 
                        subscribers.forEach((set_dirty_func, name) => {
                            set_dirty_func(principalpath); 
                            //console.log(`Notified ${name} with path: ${principalpath}`);
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
                    for (const item of value) 
                    {
                        if (item.templateid===templateid && templateid!==-1)
                            if (this.#objectReference.has(item.data)) 
                                keystodelete.push(key);
                    }       
                });

                for (let i = 0; i < keystodelete.length-1; i++)
                    this.#dependencies.delete(keystodelete[i]);

                Object.keys(computedProperties).forEach(key => {
                    //Create an array before deleting in the set
                    for (let directive of [...computedProperties[key].userInterfaces]) {
                        if (directive.templateid===templateid)
                            computedProperties[key].userInterfaces.delete(directive);
                    }
                });

            }

            removeDependency(object)
            {
                let keystodelete = [];
                this.#dependencies.forEach((value, key) => 
                {
                    for (const item of value) 
                    {
                        if (this.#objectReference.has(object)) 
                            keystodelete.push(key);
                    }       
                });

                for (let i = 0; i < keystodelete.length-1; i++)
                    this.#dependencies.delete(keystodelete[i]);

            }

            getDependencies(object)
            {
                let returndependencies = [];
                let connectedkeys = [];
                this.#dependencies.forEach((value, key) => 
                {
                    for (const item of value) 
                    {
                        if (this.#objectReference.has(object)) 
                            connectedkeys.push(key);
                    }       
                });

                for (let i = 0; i < connectedkeys.length-1; i++)
                    returndependencies.push(connectedkeys[i]);

                return returndependencies;
            } 

            getAllDependencies()
            {
                return this.#dependencies;
            } 

            track(scope, ui) 
            {
                this.#trackingCalls++;

                if (!ui.data)
                    console.error(`Tracked UI has no data`,ui);

                if (BareaHelper.DIR_GROUP_COMPUTED.includes(ui.directive))
                    return;

                const object = ui.data;
              
                let depKey="";
                if (scope==='value')
                {
                    depKey = this.#getObjectId(object).id + ":value:" + ui.key; 
                }
                else if (scope==='object')
                {
                    depKey = this.#getObjectId(object).id + ":object:"; 
                }

                if (!depKey)
                    return false;
                
                if (!this.#dependencies.has(depKey)) 
                {
                    this.#dependencies.set(depKey, new Set());
                }
                this.#dependencies.get(depKey).add(ui);

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
                    if (resultset.length===0)
                        return;
    
                    this.#notifycallback(reasonobj, reasonkey, reasonvalue, path, resultset, reasonfuncname);
                }
                else
                {
                  //Shouldn't happen
                  console.warn('UI dependency tracker was notified of an object that was not tracked', reasonobj);

                }
              
            }

            notifyDependentUserInterface(uiset) 
            {
                if (uiset)
                {
                    let resultset = new Set([...uiset]);
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
    static META_ARRAY_VARNAME = 'ba-varname';
    static META_ARRAY_INDEX = 'ba-index';
    static META_PATH = 'ba-path';
    static META_DYN_FUNC_PREFIX = 'dynFunc_';
    static META_DYN_TEMPLATE_FUNC_PREFIX = 'dynTemplFunc_';
    static META_IS_GENERATED_MARKUP= 'ba-generated';

    // Special interpolation expressions
    static INTERPOL_INDEX = 'index';


    //Expression types
    static EXPR_TYPE_ROOT_PATH = 'path';
    static EXPR_TYPE_HANDLER = 'handler';
    static EXPR_TYPE_COMPUTED = 'computed';
    static EXPR_TYPE_OBJREF = 'objref';
    static EXPR_TYPE_OBJREF_PATH = 'objpath';
    static EXPR_TYPE_OBJREF_EXPR = 'objexpr';
    static EXPR_TYPE_ROOT_EXPR = 'rootexpr';
    static EXPR_TYPE_MIX_EXPR = 'mixexpr';

    //The root of your data
    static ROOT_OBJECT = 'root';

    //Array functions to handle in the proxy
    static ARRAY_FUNCTIONS = ['push', 'pop', 'splice', 'shift', 'unshift']; //'sort', 'reverse' 

    //Path (String) functions
    static getPrincipalBareaPath = function(path) 
    {
        const segments = path.split('.');
        return segments.map(segment => {
        const arrayIndexStart = segment.indexOf('[');
        if (arrayIndexStart !== -1) {
            return segment.slice(0, arrayIndexStart);
        }
        return segment; 
        }).join('.'); 
    }

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



