/**
 * barea.js
 * 
 * Author: Johan Filipsson
 * License: MIT
 * Description: A lightweight and reactive JavaScript library for modern web applications.
 * 
 * Copyright (c) 2025 Johan Filipsson
 */
function getBareaApp(enableInternalId){
    return new BareaApp(enableInternalId);
}

//Directives
const DIR_BIND = 'ba-bind';
const DIR_BIND_HANDLER  = 'ba-bind-handler';
const DIR_FOREACH = 'ba-foreach';
const DIR_CLICK = 'ba-click';
const DIR_CLASS = 'ba-class';
const DIR_CLASS_IF = 'ba-class-if';
const DIR_HIDE = 'ba-hide';
const DIR_SHOW = 'ba-show';
const DIR_IMAGE_SRC = 'ba-src';
const DIR_IF = 'ba-if';
const DIR_HREF = 'ba-href';
const DIR_INTERPOLATION = 'interpolation';

const DIR_GROUP_BOUND_TO_PATHS = [DIR_BIND,DIR_CLASS,DIR_HREF,DIR_IMAGE_SRC,DIR_INTERPOLATION]
const DIR_GROUP_TRACK_AND_FORGET = [DIR_CLICK]
const DIR_GROUP_COMPUTED = [DIR_CLASS_IF,DIR_HIDE,DIR_SHOW, DIR_IF]
const DIR_GROUP_MARKUP_GENERATION = [DIR_FOREACH]

const UI_INPUT_TEXT = 1;
const UI_INPUT_CHECKBOX = 2;
const UI_INPUT_RADIO = 3;
const UI_INPUT_CUSTOM = 4;


//Verbs
const VERB_SET_DATA = 'SET_DATA';
const VERB_SET_UI = 'SET_UI';


//Dom meta data
const META_ARRAY_VARNAME = 'ba-varname';
const META_ARRAY_INDEX = 'ba-index';
const META_PATH = 'ba-path';
const META_DYN_FUNC_PREFIX = 'dynFunc_';
const META_DYN_TEMPLATE_FUNC_PREFIX = 'dynTemplFunc_';
const META_IS_GENERATED_MARKUP= 'ba-generated';

// Special interpolation expressions
const INTERPOL_INDEX = 'index';


//Expression types
const EXPR_TYPE_ROOT_PATH = 'path';
const EXPR_TYPE_HANDLER = 'handler';
const EXPR_TYPE_COMPUTED = 'computed';
const EXPR_TYPE_OBJREF = 'objref';
const EXPR_TYPE_OBJREF_PATH = 'objpath';
const EXPR_TYPE_OBJREF_EXPR = 'objexpr';
const EXPR_TYPE_ROOT_EXPR = 'rootexpr';
const EXPR_TYPE_MIX_EXPR = 'mixexpr';

//The root of your data
const ROOT_OBJECT = 'root';

//Array functions to handle in the proxy
const ARRAY_FUNCTIONS = ['push', 'pop', 'splice', 'shift', 'unshift']; //'sort', 'reverse' 

//Path (String) functions
const getPrincipalBareaPath = function(path) 
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

const getLastBareaKeyName = function(path)
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

const getLastBareaObjectName = function(path)
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

const parseBareaFunctionCall = function(str) 
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


const hasAnyChar = function(str, chars) 
{
    return chars.some(char => str.includes(char));
}

class BareaApp 
{

    #appElement; 
    #bareaId=0;
    #internalSystemCounter = 0;
    #appDataProxy; 
    #appDataProxyMap = new WeakMap(); //Cache proxied objects
    #appData;
    #methods = {};
    #consoleLogs = [];
    #mounted=false;
    #mountedHandler=null;
    #computedProperties = {};
    #computedKeys = [];
    #enableBareaId = false;
    #enableInterpolation = true;
    #enableHideUnloaded=false;
    #enableComputedProperties=false;

    //UI
    #uiDependencyTracker=null;

    //Computed dependency tracker
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
                    this.#enableComputedProperties=true;
                    this.#computedProperties[key] = this.#getNewComputedProperty(content.computed[key], key);
                    this.#computedKeys.push(key);
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
          
        const proxy = this.#createReactiveProxy((path, value, key, target) => 
        { 
            //Handles changes in the data and updates the dom
            let log = this.#getConsoleLog(1);
            if (log.active)
                console.log(log.name, path, value, key, target);

            let noproxy = this.#appDataProxyMap.get(target);
            if (noproxy)
                this.#uiDependencyTracker.notifyUI(noproxy, key, value, path);
            else
                this.#uiDependencyTracker.notifyUI(target, key, value, path);

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

   
    #createReactiveProxy(callback, data, currentpath = "root") 
    {
        const handler = {
            get: (target, key) => {
                const value = target[key];
                const newPath = Array.isArray(target) ? `${currentpath}[${key}]` : `${currentpath}.${key}`;
              
                if (this.#enableComputedProperties)
                {
                    //They will only be tracked if the computed function is run
                    //The function activates tracking
                    if(typeof value === "function" && ARRAY_FUNCTIONS.includes(value.name))
                        this.#computedPropertiesDependencyTracker.track(newPath, value.name);
                    else
                        this.#computedPropertiesDependencyTracker.track(newPath, null);

                    if (Array.isArray(target))
                    {
                        //These won't be detected otherwise
                        ARRAY_FUNCTIONS.forEach(f=>{ this.#computedPropertiesDependencyTracker.track(currentpath, f);});
                    }
                }
               
                if (typeof value === 'object' && value !== null) 
                {
                    if (this.#appDataProxyMap.has(value)) {
                        return this.#appDataProxyMap.get(value);
                    }

                    if (!Array.isArray(value) && this.#enableBareaId && !value.hasOwnProperty('baId')) 
                    {
                        value.baId = ++this.#bareaId;  
                    }

                    let proxiedValue = this.#createReactiveProxy(callback, value, newPath); 
                    this.#appDataProxyMap.set(value, proxiedValue);
                    return proxiedValue;

                }else{

                    if(typeof value === "function")
                    {
                        if (ARRAY_FUNCTIONS.includes(value.name)) 
                        {
                            if (!this.bareaWrappedMethods) {
                                this.bareaWrappedMethods = new Map();
                            }
                            let funckey = currentpath+'_'+value.name;
                            if (!this.bareaWrappedMethods.has(funckey)) {
                                this.bareaWrappedMethods.set(funckey, (...args) => {

                                    const result = Array.prototype[value.name].apply(target, args);

                                    if (this.#enableComputedProperties)
                                        this.#computedPropertiesDependencyTracker.notify(currentpath, value.name);

                                    callback(currentpath, value.name, key, target);

                                    
                                    return result;
                                });
                            }
                        
                            return this.bareaWrappedMethods.get(funckey);

                        }    
        
                    }
                }
              
                return value;
            },
            set: (target, key, value) => {

                const newPath = Array.isArray(target) ? `${currentpath}[${key}]` : `${currentpath}.${key}`;

                if(typeof value === "function" && !ARRAY_FUNCTIONS.includes(value.name))
                    return true;

                if (target[key] === value) 
                    return true;
        
                target[key] = value;

                if (this.#enableComputedProperties)
                {
                    if(typeof value === "function"  && ARRAY_FUNCTIONS.includes(value.name))
                        this.#computedPropertiesDependencyTracker.notify(newPath, value.name);
                    else
                        this.#computedPropertiesDependencyTracker.notify(newPath, null);

                }
                    
                callback(newPath, value, key, target);

                return true;
            }
        };
        
        let proxiedValue =new Proxy(data, handler);
        this.#appDataProxyMap.set(data, proxiedValue);
        return proxiedValue;

    }

    /***UI TRACKING ***/
    #detectElements(tag=this.#appElement, templateid=-1, templatedata, templatekey)
    {
        //Delete dynamic functions that was created along with the templates
        this.#computedPropertiesDependencyTracker.deleteDynamicTemplateFunctions();

        
        //Collect children of the template (this is the user generated template, that should be replaced)
        const templateChildren=[];
        function collectDescendants(ce) {
            templateChildren.push(ce);
            for (let i = 0; i < ce.children.length; i++) {
                collectDescendants(ce.children[i]);
            }
        }
        tag.querySelectorAll(`[${DIR_FOREACH}]`).forEach(parent => {
            Array.from(parent.children).forEach(child => collectDescendants(child));
        });

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

            
                    if (DIR_GROUP_BOUND_TO_PATHS.includes(attr.name))
                    {
                        const attribute_value_type = this.#getExpressionType(attr.value, attr.name);
                        if (attribute_value_type==='INVALID')
                        {
                            console.error(`The ${attr.name} directive has an invalid (${attr.value}).`);
                            return;
                        }

                        let inputtype = "";
                        let systeminput = -1;
                        if (attr.name===DIR_BIND)
                        {
                            inputtype = el.getAttribute("type");
                            if (!inputtype){
                                systeminput=4;
                                //console.warn(`could not detect inputtype on element where ${DIR_BIND} is used`);
                            }else{

                                if (inputtype.toLowerCase()==="text")
                                    systeminput=1;
                                if (inputtype.toLowerCase()==="checkbox")
                                    systeminput=2;
                                if (inputtype.toLowerCase()==="radio")
                                    systeminput=3;
                            }
                        }

                        let tracking_obj = this.#createUiTrackingObject(templateid,el,attr.name,attr.value,null,"",systeminput);
                
                        if (!templatedata){
                            let objpath = getLastBareaObjectName(attr.value);
                            tracking_obj.data=this.getProxifiedPathData(objpath);
                            tracking_obj.key=getLastBareaKeyName(attr.value);
                        }else{
                            tracking_obj.data=templatedata;
                            tracking_obj.key=getLastBareaKeyName(attr.value);
                        }
                    
                        let handlername = el.getAttribute(DIR_BIND_HANDLER);
                        if (handlername)
                        {
                            const check_handler = this.#getExpressionType(handlername, DIR_BIND_HANDLER);
                            if (check_handler==='INVALID')
                            {
                                console.error(`The ${DIR_BIND_HANDLER} directive has an invalid value (${handlername}), should be funcname(), or funcname(args..).`);
                                return;
                            }

                            tracking_obj.hashandler=true;
                            tracking_obj.handlername=handlername;
                        
                        }
                        
                        
                        this.#uiDependencyTracker.trackUI(attr.value, tracking_obj);

                            if (tracking_obj.directive===DIR_BIND)
                            {

                                if (tracking_obj.hashandler)
                                {
                                    this.#runBindHandler(VERB_SET_UI, tracking_obj);
                                }
                               
                                if (tracking_obj.inputtype === UI_INPUT_TEXT){
                                    this.#setInputText(tracking_obj);
                                }
                                else if (tracking_obj.inputtype === UI_INPUT_CHECKBOX){
                                    this.#setInputCheckbox(tracking_obj);
                                }
                                else if (tracking_obj.inputtype === UI_INPUT_RADIO){
                                    this.#setInputRadio(tracking_obj);
                                }

                                el.addEventListener("input", (event) => {

                                    if (tracking_obj.hashandler)
                                    {
                                            this.#runBindHandler(VERB_SET_DATA, tracking_obj);
                                            return;
                                    }

                                    const log = this.#getConsoleLog(3);
                                    if (tracking_obj.inputtype === UI_INPUT_CHECKBOX){
                                        if (log.active)
                                            console.log(log.name, "type: " + el.type, "key: " + valuekey, "input value: " + el.checked);
                
                                        tracking_obj.data[tracking_obj.key] =  el.checked;
                                    } 
                                    else if (tracking_obj.inputtype === UI_INPUT_RADIO){
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
                            else if (tracking_obj.directive===DIR_CLASS){
                                let classnames = el.getAttribute('classNames');
                                tracking_obj.orgvalue=classnames;
                                this.#setClass(tracking_obj);
                            }
                            else if (tracking_obj.directive===DIR_HREF){
                                this.#setHref(tracking_obj);
                            }
                            else if (tracking_obj.directive===DIR_IMAGE_SRC){
                                this.#setSrc(tracking_obj);
                            }
                          
                            
                    }
                    else if (DIR_GROUP_COMPUTED.includes(attr.name))
                    {

                        const genMarkup = el.getAttribute(META_IS_GENERATED_MARKUP);
                        const varname = el.getAttribute(META_ARRAY_VARNAME);
                        const attribute_value_type = this.#getExpressionType(attr.value, attr.name, varname);
                        if (attribute_value_type==='INVALID')
                         {
                            console.error(`Then ${attr.name} directive has an invalid value (${attr.value}).`);
                            return;
                        }
    
                        let condition = attr.value.trim();
                        if (condition.includes('?'))
                            condition = condition.split('?')[0];

                        let handlername = "";
                        if (genMarkup){
                            handlername = `${META_DYN_TEMPLATE_FUNC_PREFIX}${this.#internalSystemCounter}`;
                        }else{
                            handlername = `${META_DYN_FUNC_PREFIX}${this.#internalSystemCounter}`;
                        }

                        const tracking_obj = this.#createUiTrackingObject(templateid,el,attr.name,attr.value,null,"",-1);
                        if (!templatedata){
                            tracking_obj.data=this.#appDataProxy;
                            tracking_obj.key="";
                        }else{
                            tracking_obj.data=templatedata;
                            tracking_obj.key=templatekey;
                        }

                        if (attr.name === DIR_IF){
                            tracking_obj.elementnextsibling=el.nextSibling;
                            tracking_obj.parentelement=el.parentElement;
                        }
            
                        if (attribute_value_type === EXPR_TYPE_COMPUTED)
                        {
                            tracking_obj.handlername=condition;
                            this.#uiDependencyTracker.trackUI('global', tracking_obj);
                            this.#runComputedFunction(tracking_obj);
                        }
                        else if (attribute_value_type === EXPR_TYPE_ROOT_EXPR){
                    
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

                            this.#enableComputedProperties=true;
                            this.#computedProperties[handlername] = this.#getNewComputedProperty(boolRootFunc,handlername);
                            this.#computedKeys.push(handlername);
                            tracking_obj.handlername=handlername;
                            this.#uiDependencyTracker.trackUI('global', tracking_obj);
                            this.#runComputedFunction(tracking_obj);

                        }
                        else if (attribute_value_type === EXPR_TYPE_OBJREF_EXPR)
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

                            this.#enableComputedProperties=true;
                            this.#computedProperties[handlername] = this.#getNewComputedProperty(boolObjFunc,handlername);
                            this.#computedKeys.push(handlername);
                            tracking_obj.handlername=handlername;
                            this.#uiDependencyTracker.trackUI('global', tracking_obj);
                            this.#runComputedFunction(tracking_obj);

                        }  
                        else if (attribute_value_type === EXPR_TYPE_MIX_EXPR)
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

                            this.#enableComputedProperties=true;
                            this.#computedProperties[handlername] = this.#getNewComputedProperty(boolMixedFunc,handlername);
                            this.#computedKeys.push(handlername);
                            tracking_obj.handlername=handlername;
                            this.#uiDependencyTracker.trackUI('global', tracking_obj);
                            this.#runComputedFunction(tracking_obj);
                        
                        }
                        
                    }
                    else if (DIR_GROUP_TRACK_AND_FORGET.includes(attr.name))
                    {
                        const attribute_value_type = this.#getExpressionType(attr.value, attr.name);
                        if (attribute_value_type==='INVALID')
                        {
                            console.error(`Then ${attr.name} directive has an invalid value (${attr.value}).`);
                            return;
                         }

                        //SPECIAL: NO TRACKING, ONLY REGISTER HANDLER
                        if (attribute_value_type === EXPR_TYPE_HANDLER)
                        {
                            el.addEventListener("click", (event) => {
                  
                                let eventdata = this.#appDataProxy;
                                let bapath = el.getAttribute(META_PATH);
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
                                let pieces = parseBareaFunctionCall(attr.value);
                                allparams.push(...pieces.params);
                                if (this.#methods[pieces.functionName]) {
                                       this.#methods[pieces.functionName].apply(this, allparams);
                                } else {
                                    console.warn(`Handler function '${pieces.functionName}' not found.`);
                                }
                            });     
                        }
                        
                    }
                    else if (DIR_GROUP_MARKUP_GENERATION.includes(attr.name) && tag === this.#appElement)
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
        
                        const tracking_obj = this.#createUiTemplateTrackingObject(templateid,el,attr.name,attr.value,null,"", el.parentElement,templateHtml, el.localName);
                        this.#uiDependencyTracker.trackUI('global', tracking_obj);
                       
                        el.remove();

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
                            const attribute_value_type = instance.#getExpressionType(path,DIR_INTERPOLATION);
                            if (attribute_value_type==='INVALID')
                            {
                                console.error(`The ${DIR_INTERPOLATION} directive has an invalid expression (${path}).`);
                                return;
                            }

                            let tracking_obj = instance.#createUiInterpolationTrackingObject(templateid,DIR_INTERPOLATION,path,null,"",node, expr, node.nodeValue);
                            if (attribute_value_type===EXPR_TYPE_COMPUTED){
                                tracking_obj.iscomputed = true;
                                nodeexpressions.push(tracking_obj);
                            }
                            else if ([EXPR_TYPE_ROOT_PATH,EXPR_TYPE_OBJREF,EXPR_TYPE_OBJREF_PATH,INTERPOL_INDEX].includes(attribute_value_type))
                            {
                                //Find data
                                if (!templatedata){
                                    let objpath = getLastBareaObjectName(path);
                                    tracking_obj.data=instance.getProxifiedPathData(objpath);
                                }else{
                                    tracking_obj.data = templatedata;
                                }

                                //Find key
                                tracking_obj.key="";
                                let interpolation_key = getLastBareaKeyName(path);
                                if (interpolation_key!=='root'){
                                    tracking_obj.key=interpolation_key;
                                }

                                tracking_obj.iscomputed = false;
                                nodeexpressions.push(tracking_obj);
                          
                            }
                            
                        });  
                        
                        if (nodeexpressions.length>0)
                        {
                            //Important track per node, not per expression, must render per node
                            let tracking_obj = nodeexpressions[0];
                            tracking_obj.nodeexpressions = nodeexpressions;
                            if (nodeexpressions.length===1)
                            {
                                if (tracking_obj.iscomputed)
                                {
                                    instance.#uiDependencyTracker.trackUI('global', tracking_obj);
                                }
                                else
                                {
                                    instance.#uiDependencyTracker.trackUI(tracking_obj.directivevalue, tracking_obj);
                                }
                                instance.#setInterpolation(tracking_obj);

                            }
                            else
                            {
                                instance.#uiDependencyTracker.trackUI('global', tracking_obj);
                                instance.#setInterpolation(tracking_obj);
                            }
                        }
                       
                       
                       
                    }
                }
                
                // Traverse child nodes
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

    #createUiTrackingObject(templateid, element, directive, directivevalue, data, key, inputtype)
    {
        let id = this.#internalSystemCounter++;
        return {id: id, isnew:true, templateid: templateid, directive:directive,  directivevalue:directivevalue, element: element, data:data, key:key, hashandler:false, handlername:"", inputtype:inputtype };
    }
    #createUiTemplateTrackingObject(templateid, element, directive, directivevalue, data, key,  parentelement, templatemarkup, templatetagname)
    {
        let id = this.#internalSystemCounter++;
        return {id: id, isnew:true, templateid: templateid, directive:directive,  directivevalue:directivevalue, element: element, data:data, key:key, hashandler:false, handlername:"", inputtype:-1, parentelement : parentelement, templatemarkup : templatemarkup, templatetagname : templatetagname };
    }
    #createUiInterpolationTrackingObject(templateid, directive, directivevalue, data, key,interpolatednode, expression, nodetemplate)
    {
        let id = this.#internalSystemCounter++;
        return {id: id, isnew:true, templateid: templateid, directive:directive,  directivevalue:directivevalue, element: null, data:data, key:key, hashandler:false, handlername:"", inputtype:-1, interpolatednode: interpolatednode, expression: expression, nodetemplate:nodetemplate  };
    }

    #handleUITrackerNofify = (reasonobj, reasonkey, reasonvalue, path, resultset) =>
    {
        resultset.forEach(ui => 
        {
            if (DIR_GROUP_BOUND_TO_PATHS.includes(ui.directive)){

                    if (ui.hashandler){
                        this.#runBindHandler(VERB_SET_UI, ui);
                        return;
                    }

                    if (ui.directive===DIR_BIND)
                    {
                        if (ui.inputType === UI_INPUT_TEXT){
                            this.#setInputText(ui);
                        }
                        else if (ui.inputType === UI_INPUT_CHECKBOX){
                            this.#setInputCheckbox(ui);
                        }
                        else if (ui.inputType === UI_INPUT_RADIO){
                            this.#setInputRadio(ui);
                        }
                    }
                    else if (ui.directive===DIR_CLASS){
                        this.#setClass(ui);
                    }
                    else if (ui.directive===DIR_HREF){
                        this.#setHref(ui);
                    }
                    else if (ui.directive===DIR_IMAGE_SRC){
                        this.#setSrc(ui);
                    }
                    else if (ui.directive===DIR_INTERPOLATION){

                        //For performance, if a textnode contains only one interpolation and that is based on a computed value
                        //textnodes based on a computed value or if there are more than two expressions then they are tracked with path = global
                        // let principalpath = getPrincipalBareaPath(path);
                        // if (!this.#computedPropertiesDependencyTracker.isDepencencyPath(principalpath, ui.directivevalue) && path !== ROOT_OBJECT)
                        //     return;

                        this.#setInterpolation(ui);
                    }    
                    
            }
            else if (DIR_GROUP_MARKUP_GENERATION.includes(ui.directive)){

                this.#renderTemplates(ui, path, reasonvalue);  
            }
            else if (DIR_GROUP_COMPUTED.includes(ui.directive))
            {
                    let principalpath = getPrincipalBareaPath(path);
                    if (!this.#computedPropertiesDependencyTracker.isDepencencyPath(principalpath, ui.handlername) && path !== ROOT_OBJECT)
                        return;

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
            console.warn(`Computed boolean handler '${handlername}' not found.`);
        }
        
        if (ui.directive===DIR_HIDE)
            ui.element.style.display = boundvalue ? "none" : ""
        else if (ui.directive===DIR_SHOW)      
            ui.element.style.display = boundvalue ? "" : "none";
        else if (ui.directive===DIR_IF) 
        {
          this.#setComputedIf(ui, boundvalue);
        }
        else if (ui.directive===DIR_CLASS_IF) 
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
            ui.handlerpieces = parseBareaFunctionCall(ui.handlername);

        let allparams = [];
        if (verb === VERB_SET_UI)
            allparams = [verb, ui.element, ui.data[ui.key]];

        if (verb === VERB_SET_DATA)
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
            const attribute_value_type = this.#getExpressionType(ipstmt.directivevalue,DIR_INTERPOLATION);
            if (attribute_value_type==='INVALID')
            {
                    console.error(`The ${DIR_INTERPOLATION} directive has an invalid expression (${ipstmt.directivevalue}).`);
                    return;
            }
    
            if (attribute_value_type===EXPR_TYPE_COMPUTED){
                interpol_value=this.#computedProperties[ipstmt.directivevalue].value;
            }else if (attribute_value_type===EXPR_TYPE_ROOT_PATH || attribute_value_type===EXPR_TYPE_OBJREF || attribute_value_type===EXPR_TYPE_OBJREF_PATH)
            {
                if (ipstmt.key && ipstmt.data){
                    interpol_value = ipstmt.data[ipstmt.key];
                }else{
                    if (ipstmt.data)
                        interpol_value = ipstmt.data;
                } 
            }
            else if (attribute_value_type === INTERPOL_INDEX)
            {
                interpol_value = this.#getClosestAttribute(interpolatednode.parentElement, META_ARRAY_INDEX);
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
    #renderTemplates(ui, path='root', changedvalue) 
    {

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

            if (this.#getExpressionType(datapath, ui.directive)===EXPR_TYPE_COMPUTED)
            {
                if (this.#computedProperties[datapath])
                    foreacharray = this.#computedProperties[datapath].value;
                else
                    console.warn(`Could not find computed function name in the ${ui.directive} directive`);

                //This template is based on a computed array
                //If the incoming path is not a dependency of the computed property, then return
                let principalpath = getPrincipalBareaPath(path);
                if (!this.#computedPropertiesDependencyTracker.isDepencencyPath(principalpath, datapath) && path !== ROOT_OBJECT)
                    return;
            }
            else
            {
                  //Important: Only render on array operations like pop, push, unshift etc if bound directly with data path
                if (!(Array.isArray(changedvalue) || (this.#isPrimitive(changedvalue) && ARRAY_FUNCTIONS.includes(changedvalue))))
                    return;
                   
                foreacharray = this.getProxifiedPathData(datapath); 
            }

          
            
            if (!Array.isArray(foreacharray)){
                console.error('Could not get array in renderTemplates, should not happen if there is a god');
                return; 
            }
               

           let counter=0;
           //TODO: CLEAR OLD UI DEPENDENCIES 
           //this.#removeTemplateChildrenFromDomDictionary(template.id);
            ui.parentelement.innerHTML = ""; // Clear list
          
            const fragment = document.createDocumentFragment();

            foreacharray.forEach(row => {
                const newtag = document.createElement(ui.templatetagname);
              
                newtag.innerHTML = ui.templatemarkup;
                newtag.setAttribute(META_ARRAY_VARNAME, varname);
                newtag.setAttribute(META_ARRAY_INDEX, counter);
                newtag.setAttribute(META_IS_GENERATED_MARKUP, true);

                if (newtag.id)
                    newtag.id = newtag.id + `-${counter}` 
                else
                    newtag.id = `${ui.id}-${varname}-${counter}`; 

                fragment.appendChild(newtag);
            
                newtag.querySelectorAll(`[${DIR_IF}], [${DIR_HIDE}], [${DIR_SHOW}], [${DIR_CLASS_IF}], [${DIR_CLICK}], [${DIR_BIND}]`).forEach(el => 
                {
                    el.setAttribute(META_ARRAY_VARNAME, varname);
                    el.setAttribute(META_ARRAY_INDEX, counter);
                    el.setAttribute(META_IS_GENERATED_MARKUP, true);

                 
                    if (el.hasAttribute(DIR_BIND)) {
                        let attrib = el.getAttribute(DIR_BIND);
                        if (!attrib.includes(varname + '.'))
                            console.warn(`The ${DIR_BIND} expression ${attrib} used in an element under ${ui.directive} does not match the ${ui.directive} expression, should reference '${varname}'.`);
                    
                    }
                   
                    
                });

                let templatechildren = newtag.querySelectorAll("*"); 
                templatechildren.forEach(child => 
                {
                    child.setAttribute(META_IS_GENERATED_MARKUP, true);

                    if (child.id)
                        child.id = child.id + `-${counter}` 
                    else
                        child.id = `${varname}-${counter}`; 

                    let forattrib = child.getAttribute("for");
                    if (forattrib)
                        child.setAttribute("for", forattrib + `-${counter}`); 
                   
                });

                this.#detectElements(newtag, ui.id, row, "");

                counter++;

            });

            if (fragment.childElementCount>0)
                ui.parentelement.appendChild(fragment);   
        
    }


    /*** Internal Helpers ***/

    #getExpressionType = function(expression, directive, varname) 
    {
        if ([DIR_CLASS, DIR_BIND, DIR_IMAGE_SRC, DIR_HREF].includes(directive))
        {
            if (expression.includes('(') || expression.includes(')'))
                return "INVALID";

            if (!(expression.includes('.')))
                return "INVALID";

            if (expression.toLowerCase().startsWith('root.'))
                return EXPR_TYPE_ROOT_PATH;

            return EXPR_TYPE_OBJREF_PATH;
        }

        if ([DIR_CLICK, DIR_BIND_HANDLER].includes(directive))
        {
            if (!(expression.includes('(') && expression.includes(')')))
                return "INVALID";

            return EXPR_TYPE_HANDLER;
        }

        if ([DIR_HIDE, DIR_SHOW, DIR_IF,DIR_CLASS_IF].includes(directive))
        {
            if (expression.includes('(') || expression.includes(')'))
                return "INVALID";

            if ((expression.includes('root.')))
            {
                if (varname && expression.includes(varname+'.'))
                    return EXPR_TYPE_MIX_EXPR;

                return EXPR_TYPE_ROOT_EXPR;
            }
            
            if (!(expression.includes('.')))
                return EXPR_TYPE_COMPUTED;

            return EXPR_TYPE_OBJREF_EXPR;
        }

        if (directive === DIR_FOREACH)
        {
            if ((expression.includes('root.')))
                return EXPR_TYPE_ROOT_PATH;

            if (!(expression.includes('.')))
                return EXPR_TYPE_COMPUTED;

            return "INVALID";
        }

        if (directive === DIR_INTERPOLATION)
        {
            if (expression.includes('(') || expression.includes(')'))
                return "INVALID";

            if (expression.toLowerCase() === INTERPOL_INDEX)
                return INTERPOL_INDEX;

            if (expression.toLowerCase().startsWith('root.'))
                return EXPR_TYPE_ROOT_PATH;

            if (expression.includes('.'))
                return EXPR_TYPE_OBJREF_PATH;

            if (this.#computedKeys.includes(expression))
                return EXPR_TYPE_COMPUTED;

            return EXPR_TYPE_OBJREF;
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


    /*

Attempt to get value (if dirty)
- Opens up for tracking
- Gets value
- Gets dependencies because values are fetched (values fetched in the proxy, while open will be registered as dependencies)
- Close tracking
- Return value

Attempt to get value (if not dirty)
- Return cached value

On notify
- if target and key is depencencies, it sets it to not dirty

Unshift problem
- Has no unshift dependency
- Unshift occurs
- Notify occurs but no dependency
- Cached value is fetched

*/
    #getNewComputedProperty(getter, key)
    {
        let instance = this;
        let computed_properties_tracker = this.#computedPropertiesDependencyTracker;
        class BareaComputedProperty
        {
            constructor(getter, key, barea) {
                this.name=key;
                this.getter = getter;
                this.dirty = true;
                this.dependencyPaths = new Set();
                this.setDirty = (principalpath) => {
                    this.dirty = true;
                };
            }
        
            track(dep, principalpath) {
                dep.addSubscriber(this.name, this.setDirty); //The computed property tells that tracker: Hi i'm a new subscriber
                this.dependencyPaths.add(principalpath);
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

        return new BareaComputedProperty(getter, key);
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

            deleteDynamicTemplateFunctions()
            {
                // this.dependencies.forEach((childMap) => {
                //     childMap.subscribers.forEach((value, key) => {
                //     if (key.includes(META_DYN_TEMPLATE_FUNC_PREFIX)) {
                //         childMap.subscribers.delete(key); 
                //         if (window[key]) {
                //             delete window[key];
                //         }
                //     }
                //     });
                // });
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

                let principalpath = getPrincipalBareaPath(objpath);
                if (!principalpath)
                    return;

                if (principalpath==ROOT_OBJECT)
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

                let principalpath = getPrincipalBareaPath(objpath);
                if (!principalpath)
                    return;

                if (principalpath==ROOT_OBJECT)
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

        class UserInterfaceTracker
        {
            #dependencies = new Map();
            #objectReference = new WeakMap();
            #notifycallback = null;
            #objectCounter=0;

            constructor(notifycallback) 
            {
                if (instance)
                    return instance;

                this.#notifycallback = notifycallback;
                instance = this;
            }

            #getObjectId(obj) {
                if (!this.#objectReference.has(obj)) {
                    this.#objectReference.set(obj, ++this.#objectCounter); // Assign a new ID
                }
                return this.#objectReference.get(obj);
            }

            getAllDependencies()
            {
                return this.#dependencies;
            } 

            trackUI(trackingtype, ui) 
            {
                let depKey="";
                if (ui.data && trackingtype!== 'global')
                {
                    depKey = this.#getObjectId(ui.data) + ":" + ui.key; 

                }else{

                    depKey="global";
                }

                if (!this.#dependencies.has(depKey)) 
                {
                    this.#dependencies.set(depKey, new Set());
                }
                this.#dependencies.get(depKey).add(ui);
            }

            notifyUI(reasonobj, reasonkey, reasonvalue, path) 
            {
                let depKey = this.#getObjectId(reasonobj) + ":" + reasonkey;
                let workset = this.#dependencies.get(depKey);
                if (!workset)
                    workset= new Set();

                //If we interpolated an object belonging
                let obj_interpolations= new Set();
                if (reasonkey !== "")
                {
                    depKey = this.#getObjectId(reasonobj) + ":";
                    obj_interpolations = this.#dependencies.get(depKey);
                    if (!obj_interpolations)
                        obj_interpolations= new Set();
                }

                depKey="global";
                let globalset = this.#dependencies.get(depKey);
                if (!globalset)
                    globalset= new Set();

                let resultset = new Set([...workset, ...obj_interpolations, ...globalset]);

                this.#notifycallback(reasonobj, reasonkey, reasonvalue, path, resultset);
            }

           

        }

        return new UserInterfaceTracker(notifycallback);
    
    }

}



