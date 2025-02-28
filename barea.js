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

//Directive types
const DIR_TYPE_BINDING = 'binding';
const DIR_TYPE_HANDLER = 'uihandler';
const DIR_TYPE_UI_SETTER = 'uisetter';
const DIR_TYPE_COMPUTED = 'computed';
const DIR_TYPE_BOOLEXPR = 'computedexpression';
const DIR_TYPE_TEMPLATE = 'template';


//Verbs
VERB_SET_DATA = 'SET_DATA';
VERB_SET_UI = 'SET_UI';


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
const ARRAY_FUNCTIONS = ['push', 'pop', 'splice', 'shift', 'unshift','sort', 'reverse']; 

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
    #appDataProxy; 
    #appDataProxyMap = new WeakMap(); //Cache proxied objects
    #appData;
    #methods = {};
    #consoleLogs = [];
    #domDictionary = []; //Reference dom from paths
    #domDictionaryId=0;
    #mounted=false;
    #mountedHandler=null;
    #computedProperties = {};
    #computedKeys = [];
    #enableBareaId = false;
    #enableInterpolation = true;
    #enableHideUnloaded=false;
    #enableComputedProperties=false;

    constructor(enableInternalId) 
    {
        if (enableInternalId)
            this.#enableBareaId=enableInternalId;

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
                    this.#computedProperties[key] = new BareaComputedProperty(content.computed[key], key, this);
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

            this.#renderTemplates(path, value, key, target);
            this.#setupBindings();
            this.#applyProxyChangeInterpolation(path, value);
            this.#applyProxyChangeToDOM(path, value, key, target);

        }, this.#appData);

        this.#appDataProxy = proxy;
  
        //Important: Always directly after proxification
        this.#buildDomDictionary();
      

        if (this.#enableBareaId && ! this.#appDataProxy.hasOwnProperty('baId')) 
            this.#appDataProxy.baId = ++this.#bareaId;  // Assign a new unique ID

        if (this.#mountedHandler)   
            this.#mountedHandler.apply(this, [this.#appDataProxy]);
   

        this.#renderTemplates();
        this.#setupBindings();
        this.#applyProxyChangeInterpolation();
        this.#applyProxyChangeToDOM();
        
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
                    if(typeof value === "function")
                        dependencyTracker.track(newPath, value.name);
                    else
                        dependencyTracker.track(newPath, null);

                    if (Array.isArray(target))
                    {
                        //These won't be detected otherwise
                        ARRAY_FUNCTIONS.forEach(f=>{ dependencyTracker.track(currentpath, f);});
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
                                        dependencyTracker.notify(currentpath, value.name);

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

                if (key === "length") {
                    const oldLength = target.length;
                    target.length = value;
                
                    if (oldLength !== value) {
                        dependencyTracker.notify(newPath, value.name);
                        callback(newPath, value, key, target);
                    }
                    return true;
                }

                if (target[key] === value) return true;
        
                target[key] = value;

                if (this.#enableComputedProperties)
                {
                    if(typeof value === "function")
                        dependencyTracker.notify(newPath, value.name);
                    else
                        dependencyTracker.notify(newPath, null);

                }
                   

               
                callback(newPath, value, key, target);

                return true;
            }
        };
        
        let proxiedValue =new Proxy(data, handler);
        this.#appDataProxyMap.set(data, proxiedValue);
        return proxiedValue;

    }
    
    #buildDomDictionary(tag = this.#appElement, templateId=-1)
    {
        let funccounter = 0;
        const templateChildren=[];

        //Delete dynamic functions that was created along with the templates
        dependencyTracker.deleteDynamicTemplateFunctions();

        //Collect children of the template
        //User defined
        function collectDescendants(ce) {
            templateChildren.push(ce);
            
            for (let i = 0; i < ce.children.length; i++) {
                collectDescendants(ce.children[i]);
            }
        }
        tag.querySelectorAll(`[${DIR_FOREACH}]`).forEach(parent => {
            Array.from(parent.children).forEach(child => collectDescendants(child));
        });


        const bareaelements = [...tag.querySelectorAll("*")].filter(el => 
            [...el.attributes].some(attr => attr.name.startsWith("ba-"))
        );

        bareaelements.forEach(el => {
            const bareaAttributes = el.getAttributeNames()
            .filter(attr => attr.startsWith("ba-"))
            .map(attr => ({ name: attr, value: el.getAttribute(attr) }));

            //Skip all children of templates since they will be dealt with later on template rendering
            if (templateChildren.includes(el))
                return;

            bareaAttributes.forEach(attr =>
            {
   
                if (attr.name===DIR_FOREACH)
                {
                    if (!attr.value)
                        return;
                    if (this.#getExpressionType(attr.value, DIR_FOREACH)==='INVALID')
                    {
                        console.error(`Then ${DIR_FOREACH} directive has an invalid value (${attr.value}).`);
                        return;
                    }

                    let templateHtml = el.innerHTML.trim()
                        .replace(/>\s+</g, '><')  // Remove spaces between tags
                        .replace(/(\S)\s{2,}(\S)/g, '$1 $2'); // Reduce multiple spaces to one inside text nodes

                    const odo = this.#createDomDictionaryObject(el, el.parentElement, null, attr.name, attr.value, "template", true, templateHtml, el.localName, -1, null);
                    this.#domDictionary.push(odo);
                    el.remove();
                }

                if ([DIR_HIDE, DIR_SHOW, DIR_IF,DIR_CLASS_IF].includes(attr.name))
                {
                    const genMarkup = el.getAttribute(META_IS_GENERATED_MARKUP);
                    const varname = el.getAttribute(META_ARRAY_VARNAME);
                    const exprtype = this.#getExpressionType(attr.value, attr.name, varname);
                    funccounter++;
                    let funcname = "";
                    if (genMarkup){
                        funcname = `${META_DYN_TEMPLATE_FUNC_PREFIX}${funccounter}`;
                    }else{
                        funcname = `${META_DYN_FUNC_PREFIX}${funccounter}`;
                    }
                  

                    if (!attr.value)
                        return;
                    if (exprtype==='INVALID')
                    {
                        console.error(`Then ${attr.name} directive has an invalid value (${attr.value}).`);
                        return;
                    }
          
                    let iscomputed=false;
                    if (exprtype === EXPR_TYPE_COMPUTED)
                        iscomputed=true;

                    let expressions=[];
                    //A DIR_CLASS_IF expression contains both an express/handler and class name(s) 
                    if (attr.name===DIR_CLASS_IF && attr.value.includes('?'))
                    {
                        let attrparts = attr.value.split('?');
                        attrparts.forEach(n=>{expressions.push(n)});
                    }
                    else
                    {
                        expressions.push(attr.value);
                    }

                    if (iscomputed){
                        const odo = this.#createDomDictionaryObject(el,el.parentElement,null,attr.name,"", DIR_TYPE_COMPUTED, true,"","",templateId,expressions);
                        this.#domDictionary.push(odo);
                    }
                    else if (exprtype === EXPR_TYPE_ROOT_EXPR)
                    {
                        let condition = expressions[0];
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

                        //Make up a functionname
                        expressions.push(funcname);
                        this.#enableComputedProperties=true;
                        this.#computedProperties[funcname] = new BareaComputedProperty(boolRootFunc,funcname, this);
                        this.#computedKeys.push(funcname);
                        const odo = this.#createDomDictionaryObject(el,el.parentElement,null,attr.name,"", DIR_TYPE_BOOLEXPR, true,"","",templateId,expressions);
                        this.#domDictionary.push(odo);

                    }
                    else if (exprtype === EXPR_TYPE_OBJREF_EXPR)
                    {
                       
                        //EXPR_TYPE_OBJREF_EXPR, example: show.showText===true
                        let condition = expressions[0];
                       
                        const evalobj = el._bareaObject;
                        if (!varname)
                            return;
                        if (!evalobj)
                            return;

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
                            return evalObjExpr(condition, evalobj);
                        }

                          //Make up a functionname
                        expressions.push(funcname);
                        this.#enableComputedProperties=true;
                        this.#computedProperties[funcname] = new BareaComputedProperty(boolObjFunc,funcname, this);
                        this.#computedKeys.push(funcname);
                        const odo = this.#createDomDictionaryObject(el,el.parentElement,null,attr.name,"", DIR_TYPE_BOOLEXPR, true,"","",templateId,expressions);
                        this.#domDictionary.push(odo);

                      
                    }  
                    else if (exprtype === EXPR_TYPE_MIX_EXPR)
                    {
                       
                        //EXPR_TYPE_OBJREF_EXPR, example: show.showText===true
                        let condition = expressions[0];
                       
                        const subobj = el._bareaObject;
                        const rootobj = this.#appDataProxy;
                        if (!varname)
                            return;
                        if (!subobj)
                            return;

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

                        //Make up a functionname
                        this.#bareaId++;
                        expressions.push(funcname);
                        this.#enableComputedProperties=true;
                        this.#computedProperties[funcname] = new BareaComputedProperty(boolMixedFunc,funcname, this);
                        this.#computedKeys.push(funcname);
                        const odo = this.#createDomDictionaryObject(el,el.parentElement,null,attr.name,"", DIR_TYPE_BOOLEXPR, true,"","",templateId,expressions);
                        this.#domDictionary.push(odo);
                      
                    }
                   
                }

                if ([DIR_CLASS, DIR_IMAGE_SRC,DIR_HREF].includes(attr.name))
                {
                    if (!attr.value)
                        return;

                    let exprtype =this.#getExpressionType(attr.value, attr.name);
                    if (exprtype==='INVALID')
                    {
                        console.error(`Then ${attr.name} directive has an invalid value (${attr.value}).`);
                        return;
                    }

                    if (attr.name===DIR_IMAGE_SRC && el.localName.toLowerCase()!=="img")
                        return;

                    if (exprtype==EXPR_TYPE_ROOT_PATH && !el.hasOwnProperty('_bareaObject'))
                    {
                        let objpath = getLastBareaObjectName(attr.value);
                        el._bareaObject=this.getProxifiedPathData(objpath);
                        el._bareaKey=getLastBareaKeyName(attr.value);
                     }

                    const odo = this.#createDomDictionaryObject(el,el.parentElement,null,attr.name,attr.value, DIR_TYPE_UI_SETTER, true,"","",templateId,null);
                    this.#domDictionary.push(odo);
                    
                }

                if (DIR_BIND===attr.name)
                {
                    if (!attr.value)
                        return;

                    let exprtype = this.#getExpressionType(attr.value, DIR_BIND);
                    if (exprtype==='INVALID')
                    {
                        console.error(`Then ${DIR_BIND} directive has an invalid (${attr.value}).`);
                        return;
                    }

                    if (exprtype==EXPR_TYPE_ROOT_PATH && !el.hasOwnProperty('_bareaObject'))
                    {
                          let objpath = getLastBareaObjectName(attr.value);
                          el._bareaObject=this.getProxifiedPathData(objpath);
                          el._bareaKey=getLastBareaKeyName(attr.value);

                    }

                    const odo = this.#createDomDictionaryObject(el,el.parentElement,null,attr.name,attr.value, DIR_TYPE_BINDING, true,"","",templateId,null);
                    this.#domDictionary.push(odo);
                }

                if (DIR_CLICK === attr.name)
                {
                    if (!attr.value)
                        return;

                    if (this.#getExpressionType(attr.value, DIR_CLICK)==='INVALID')
                    {
                        console.error(`Then ${DIR_CLICK} directive has an invalid (${attr.value}).`);
                        return;
                    }

                    let expressions=[];
                    expressions.push(attr.value);
                    const odo = this.#createDomDictionaryObject(el,el.parentElement,null,attr.name,"", DIR_TYPE_HANDLER, true,"","",templateId, expressions);
                    this.#domDictionary.push(odo);
                }
            });

        });

        if (this.#enableInterpolation)
        {
            const walker = document.createTreeWalker(tag, NodeFilter.SHOW_TEXT, null, false);
            while (walker.nextNode()) {
                if (walker.currentNode.nodeValue.includes("{{") && walker.currentNode.nodeValue.includes("}}"))
                {
                    let paths = this.#getInterpolationPaths(walker.currentNode.nodeValue);
                    const odo = this.#createDomDictionaryObject(walker.currentNode.parentElement, walker.currentNode.parentElement,walker.currentNode,DIR_INTERPOLATION,"", DIR_TYPE_UI_SETTER, true,walker.currentNode.nodeValue,"",templateId, paths);
                    this.#domDictionary.push(odo);
                }
            }
        }

        let log = this.#getConsoleLog(4);
        if (log.active){
            console.log('dom dictionary: ' +  this.#domDictionary.length);
            this.#domDictionary.forEach(t=> {
                console.log(t);
            });
        }
    }

    #removeFromDomDictionaryById(id) 
    {
        this.#domDictionary = this.#domDictionary.filter(item => item.id !== id);
    }

    #removeTemplateChildrenFromDomDictionary(templatedId) 
    {
        this.#domDictionary = this.#domDictionary.filter(item => item.templateId !== templatedId); 
    }

    #createDomDictionaryObject(element, parentElement, node, directive, path, directiveType, isnew, templateMarkup, templateTagName, templateId, expressions)
    {
        if (!expressions)
        {
            expressions = [];
            expressions.push(path);
        }

        let id = this.#domDictionaryId++;

        return {id: id, templateId: templateId, element: element, elementnextsibling:null, parentelement:parentElement, node:node, directive: directive,  path:path, directivetype: directiveType, isnew: isnew, templateMarkup: templateMarkup, templateTagName: templateTagName, expressions: expressions  };
    }
  

    #setupBindings() 
    {


      let workscope = this.#domDictionary.filter(p=> p.isnew && [DIR_TYPE_BINDING, DIR_TYPE_HANDLER].includes(p.directivetype));
     
        workscope.forEach(item => 
        {

            if (item.directive===DIR_BIND)
            {
                item.isnew = false;
                item.element.addEventListener("input", (event) => {


                    let attribFuncDef = item.element.getAttribute(DIR_BIND_HANDLER);
                    if (attribFuncDef)
                    {
                        if (!item.element.hasOwnProperty('_bareaObject'))
                            return;

                        attribFuncDef=attribFuncDef.trim();
                        let pieces = parseBareaFunctionCall(attribFuncDef);
                        let allparams =  [VERB_SET_DATA, item.element, item.element._bareaObject];
                        allparams.push(...pieces.params);

                        if (this.#methods[pieces.functionName]) {
                            this.#methods[pieces.functionName].apply(this, allparams);
                        } else {
                            console.warn(`Handler function '${pieces.functionName}' not found.`);
                        }
                        return;
                    }

                    const log = this.#getConsoleLog(3);
                    if (item.element.type === "checkbox") 
                    {
                        if (log.active)
                            console.log(log.name, "type: " + item.element.type, "key: " + valuekey, "input value: " + item.element.checked);

                        item.element._bareaObject[item.element._bareaKey] =  item.element.checked;
                    } 
                    else if (item.element.type === "radio") 
                    {
                        if (log.active)
                            console.log(log.name, "type: " + item.element.type, "key: " + valuekey, "input value: " + item.element.value);

                        if (item.element.checked)
                            item.element._bareaObject[item.element._bareaKey] =  item.element.value;

                    } 
                    else 
                    {
                        if (log.active)
                            console.log(log.name, "type: " + item.element.type, "key: " + valuekey, "input value: " + item.element.value);

                        item.element._bareaObject[item.element._bareaKey] =  item.element.value;

                    }
                });

            }

            if (item.directive=== DIR_CLICK)
            {
                if (!item.expressions)
                    return;
                if (!item.expressions.length===0)
                    return;

                item.isnew = false;
                let attribFuncDef = item.expressions[0];
                attribFuncDef=attribFuncDef.trim();
                item.element.addEventListener("click", (event) => {
  
                    let eventdata = this.#appDataProxy;
                    let bapath = item.element.getAttribute(META_PATH);
                    if (!bapath)
                    {
                        if (item.element._bareaObject)
                            eventdata = item.element._bareaObject;
                    }
                    else
                    {
                        eventdata = this.getProxifiedPathData(bapath);
                    }
                  
                    let allparams = [event, item.element, eventdata];
                    let pieces = parseBareaFunctionCall(attribFuncDef);
                    allparams.push(...pieces.params);

                    if (this.#methods[pieces.functionName]) {
                        this.#methods[pieces.functionName].apply(this, allparams);
                    } else {
                        console.warn(`Handler function '${pieces.functionName}' not found.`);
                    }
                });
  
            }

        });
    
    }

    /**
     * Render templates = adding new stuf to the DOM
     * @param {string} path - The path affected when proxy updated.
     * @param {any} value - The value changed in the proxy.
     * @param {string} key - The key in the parent affected object.
     * @param {any} target - The parent object of what's changed.
     */
    #renderTemplates(path='root',value, key='none', target) 
    {

        let foreacharray = [];
        let canrun = false;

      
        let templates = this.#domDictionary.filter(p=> p.directivetype===DIR_TYPE_TEMPLATE);
      
        templates.forEach(template => {

            let [varname, datapath] = template.path.split(" in ").map(s => s.trim());
            if (!varname)
            {
                console.error(`No variable name was found in the ${DIR_FOREACH} expression`);
                return;
            }
            if (!datapath)
            {
                console.error(`No path or computed function was found in the ${DIR_FOREACH} expression`);
                return;
            }

            if (this.#getExpressionType(datapath, DIR_FOREACH)===EXPR_TYPE_COMPUTED)
            {
                if (this.#computedProperties[datapath])
                    foreacharray = this.#computedProperties[datapath].value;
                else
                    console.warn(`Could not find computed function name in the ${DIR_FOREACH} directive`);

                //This template is based on a computed array
                //If the incoming path is not a dependency of the computed property, then return
                let principalpath = getPrincipalBareaPath(path);
                if (!dependencyTracker.isDepencencyPath(principalpath, datapath))
                    return;
            }
            else
            {
                  //Important: Only render on array operations like pop, push, unshift etc if bound directly with data path
                if (!(Array.isArray(value) || (this.#isPrimitive(value) && ARRAY_FUNCTIONS.includes(value))))
                    return;
                     
                foreacharray = this.getProxifiedPathData(datapath); 
            }
            
            if (!Array.isArray(foreacharray)){
                console.error('Could not get array in renderTemplates, should not happen if there is a god');
                return; 
            }
               


           let counter=0;
            this.#removeTemplateChildrenFromDomDictionary(template.id);
            template.parentelement.innerHTML = ""; // Clear list
          
            const fragment = document.createDocumentFragment();

            foreacharray.forEach(item => {
                const newtag = document.createElement(template.templateTagName);
              
                newtag.innerHTML = template.templateMarkup;
                newtag.setAttribute(META_ARRAY_VARNAME, varname);
                newtag.setAttribute(META_ARRAY_INDEX, counter);
                newtag.setAttribute(META_IS_GENERATED_MARKUP, true);
                newtag._bareaObject = item;
                if (newtag.id)
                    newtag.id = newtag.id + `-${counter}` 
                else
                    newtag.id = `${template.id}-${varname}-${counter}`; 

                fragment.appendChild(newtag);
            
                newtag.querySelectorAll(`[${DIR_IF}], [${DIR_HIDE}], [${DIR_SHOW}], [${DIR_CLASS_IF}], [${DIR_CLICK}], [${DIR_BIND}]`).forEach(el => 
                {
                    el._bareaObject = item;
                    el.setAttribute(META_ARRAY_VARNAME, varname);
                    el.setAttribute(META_ARRAY_INDEX, counter);
                    el.setAttribute(META_IS_GENERATED_MARKUP, true);

                 
                    if (el.hasAttribute(DIR_BIND)) {
                        let attrib = el.getAttribute(DIR_BIND);
                        if (!attrib.includes(varname + '.'))
                            console.warn(`The ${DIR_BIND} expression ${attrib} used in an element under ${DIR_FOREACH} does not match the ${DIR_FOREACH} expression, should reference '${varname}'.`);
                    
                        el._bareaKey=getLastBareaKeyName(attrib);
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

                this.#buildDomDictionary(newtag, template.id);

                counter++;

            });

            if (fragment.childElementCount>0)
                template.parentelement.appendChild(fragment);
           
        });    
    }

    #applyProxyChangeInterpolation(path='root', changedvalue)
    {
        const interpolations = this.#domDictionary.filter(p=>p.directive===DIR_INTERPOLATION);
        interpolations.forEach(t=>
        {
            let count=0;
            let content= t.templateMarkup;
            t.expressions.forEach(expr=> 
            {
                //Just to speed up
                //If primitive (path), example : root.model.user.firstname
                //Only interpolate root, root.model, root.model.user, root.model.user.firstname
                if (changedvalue)
                {
                    if (this.#isPrimitive(changedvalue) && expr.includes('root'))
                    {
                        if (!path.includes(expr))
                            return;
                    }
                }

                let exprvalue = null;
                let exprtype = this.#getExpressionType(expr, DIR_INTERPOLATION);
                if (exprtype===EXPR_TYPE_COMPUTED){
                    exprvalue=this.#computedProperties[expr].value;
                }else if (exprtype===EXPR_TYPE_ROOT_PATH){
                    exprvalue = this.getPathData(expr);
                }else if (exprtype===EXPR_TYPE_OBJREF){
                    exprvalue = this.#getClosestBareaObject(t.element);
                }
                else if (exprtype===EXPR_TYPE_OBJREF_PATH){
                    let subobj = this.#getClosestBareaObject(t.element);
                    let key =  getLastBareaKeyName(expr);
                    exprvalue = subobj[key];
                }
                else if (expr === INTERPOL_INDEX)
                {
                    exprvalue = this.#getClosestAttribute(t.element, META_ARRAY_INDEX);
                }

                if (!exprvalue)
                    exprvalue ="";

                if (typeof exprvalue === "object") 
                    exprvalue = JSON.stringify(exprvalue)
              
                count++;
                const regex = new RegExp(`{{\\s*${expr.replace(/[.[\]]/g, '\\$&')}\\s*}}`, 'g');
                content = content.replace(regex, exprvalue);        
                
            });
            if (count>0)
                t.node.textContent = content;

        });

    }
   
    #applyProxyChangeToDOM(path='root', value=this.#appDataProxy, key, keyobject) 
    {
        
            //Computed handlers get cashed value (updates when used by other, become dirty)
            const computedfuncs = this.#domDictionary.filter(p=> p.directivetype === DIR_TYPE_COMPUTED);
            computedfuncs.forEach(t=>
            {
              
                let attribFuncDef = t.expressions[0];
                let boundvalue = false;
                attribFuncDef=attribFuncDef.trim();
                if (this.#computedProperties[attribFuncDef]) {
                        boundvalue = this.#computedProperties[attribFuncDef].value;
                } else {
                    console.warn(`Computed boolean handler '${attribFuncDef}' not found.`);
                }
                
                if (t.directive===DIR_HIDE)
                    t.element.style.display = boundvalue ? "none" : ""
                else if (t.directive===DIR_SHOW)      
                    t.element.style.display = boundvalue ? "" : "none";
                else if (t.directive===DIR_IF) 
                {
                    if (boundvalue)
                    {
                        if (!t.element.parentNode)
                            if (t.elementnextsibling)
                                t.parentelement.insertBefore(t.element, t.elementnextsibling);
                    }else
                    {
                        if (t.element.parentNode)
                        {
                            t.elementnextsibling = t.element.nextSibling;
                            t.element.remove();
                        }   
                    }
                }
                else if (t.directive===DIR_CLASS_IF && t.expressions.length>1) 
                {
                   let classnames = t.expressions[1].split(/[\s,]+/);

                    // Add classes if condition is true and remove if false
                    if (boundvalue) {
                        classnames.forEach(className => {
                            if (!t.element.classList.contains(className)) {
                                t.element.classList.add(className); // Add class if not already present
                            }
                        });
                    } else {
                        classnames.forEach(className => {
                            if (t.element.classList.contains(className)) {
                                t.element.classList.remove(className); // Remove class if present
                            }
                        });
                    }
                }    
                      
            });

            //Boolean expressions (react on any data change)
            const boolexpr = this.#domDictionary.filter(p=> p.directivetype === DIR_TYPE_BOOLEXPR);
            boolexpr.forEach(t=>
            {
                if (!t.expressions)
                    return;

                   
                let funcname = "";
                if (t.expressions.length>2)
                    funcname=t.expressions[2]
                else
                    funcname=t.expressions[1];

                if (!funcname)
                {
                    console.error('Could not find function name for computed boolean expression fucntion');
                    return;
                }
                let boundvalue = false;
                if (this.#computedProperties[funcname]) {
                    boundvalue = this.#computedProperties[funcname].value;
                } else {
                    console.warn(`Computed boolean expression fucntion '${pieces.functionName}' not found.`);
                }    
                 
                
                if (t.directive===DIR_HIDE)
                    t.element.style.display = boundvalue ? "none" : ""
                else if (t.directive===DIR_SHOW)      
                    t.element.style.display = boundvalue ? "" : "none";
                else if (t.directive===DIR_IF) 
                {
                      if (boundvalue)
                      {
                          if (!t.element.parentNode)
                              if (t.elementnextsibling)
                                  t.parentelement.insertBefore(t.element, t.elementnextsibling);
                      }else
                      {
                          if (t.element.parentNode)
                          {
                              t.elementnextsibling = t.element.nextSibling;
                              t.element.remove();
                          }   
                      }
                } 
                else if (t.directive===DIR_CLASS_IF && t.expressions.length>1) 
                {
                   let classnames = t.expressions[1].split(/[\s,]+/);

                    // Add classes if condition is true and remove if false
                    if (boundvalue) {
                        classnames.forEach(className => {
                            if (!t.element.classList.contains(className)) {
                                t.element.classList.add(className); // Add class if not already present
                            }
                        });
                    } else {
                        classnames.forEach(className => {
                            if (t.element.classList.contains(className)) {
                                t.element.classList.remove(className); // Remove class if present
                            }
                        });
                    }
                }     
                        
            });

            const bareabind = this.#domDictionary.filter(p=>p.directive===DIR_BIND);
            bareabind.forEach(t=>
            {
             
                if (!t.element._bareaObject || !t.element._bareaKey)
                    return;

                let boundvalue = t.element._bareaObject[t.element._bareaKey];
                if (!boundvalue)
                    return;

               
                let attribFuncDef = t.element.getAttribute(DIR_BIND_HANDLER);
                if (attribFuncDef)
                {
                    attribFuncDef=attribFuncDef.trim();
                    if (this.#getExpressionType(attribFuncDef, DIR_BIND_HANDLER)==="INVALID")
                        return;
                 
                    let pieces = parseBareaFunctionCall(attribFuncDef);
                    let allparams = [VERB_SET_UI, t.element, boundvalue];
                    allparams.push(...pieces.params);

                    if (this.#methods[pieces.functionName]) {
                        this.#methods[pieces.functionName].apply(this, allparams);
                    } else {
                        console.warn(`Handler function '${pieces.functionName}' not found.`);
                    }
                    return;
                }


                if (t.element.type === "checkbox") 
                {
                    if (!boundvalue)
                        boundvalue=false;

                    t.element.checked = boundvalue;
                } 
                else if (t.element.type === "radio")
                {
                    t.element.checked = t.element.value === boundvalue;
                } 
                else 
                {
                    if (!boundvalue)
                        value="";

                    if (t.element.value !== boundvalue) 
                    {
                        t.element.value = boundvalue;
                    }
                }       
                                
            });

            
            const bareaclass = this.#domDictionary.filter(p=>p.directive===DIR_CLASS && p.directivetype===DIR_TYPE_UI_SETTER);
            bareaclass.forEach(t=>
            {

                if (!t.element._bareaObject || !t.element._bareaKey)
                    return;

                let boundvalue = t.element._bareaObject[t.element._bareaKey];
                if (!boundvalue)
                    return;
             
                if (boundvalue.includes(','))
                    boundvalue = boundvalue.replaceAll(',', ' ');

                t.element.className = boundvalue || "";
        
            });

            const bareaimgsrc = this.#domDictionary.filter(p=>p.directive===DIR_IMAGE_SRC && p.directivetype===DIR_TYPE_UI_SETTER);
            bareaimgsrc.forEach(t=>
            {
                if (!t.element._bareaObject || !t.element._bareaKey)
                    return;

                let boundvalue = t.element._bareaObject[t.element._bareaKey];
                if (!boundvalue)
                    return;

                if (boundvalue && (t.element.src!==boundvalue))
                {
                    t.element.src = boundvalue;
                }
        
            });

            const bahref = this.#domDictionary.filter(p=>p.directive===DIR_HREF && p.directivetype===DIR_TYPE_UI_SETTER);
            bahref.forEach(t=>
            {
                if (!t.element._bareaObject || !t.element._bareaKey)
                    return;

                let boundvalue = t.element._bareaObject[t.element._bareaKey];
                if (!boundvalue)
                    return;

                if (boundvalue && (t.element.href !== boundvalue))
                {
                    t.element.href = boundvalue;
                }
        
            });
          
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

    #shallowEqual(obj1, obj2) 
    {
        if (obj1 === obj2) return true; // Fast reference check
      
        const keys1 = Reflect.ownKeys(obj1);
        const keys2 = Reflect.ownKeys(obj2);
        if (keys1.length !== keys2.length) return false;
      
        return keys1.every(key => obj1[key] === obj2[key]);
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

   
    //Get interpolation data paths from a string found in the dom
    #getInterpolationPaths(str) {
        const regex = /{{(.*?)}}/g;
        let matches = [];
        let match;
    
        while ((match = regex.exec(str)) !== null) {
            matches.push(match[1].trim()); // Trim spaces inside {{ }}
        }
    
        return matches;
    }


    #isPrimitive(value)
    {
        let result = value !== null && typeof value !== "object" && typeof value !== "function";
        return result;
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
            {id: 4, name: "Build dom dictionary: ", active:false},
            {id: 5, name: "Debug dependency tracking: ", active:false}
        ];
    } 

    
                   
    /* Dom Handler */
    #loadedHandler =  (event) => {
       if (this.#enableHideUnloaded)
       {
            document.querySelectorAll(".ba-cloak").forEach(el => el.classList.remove("ba-cloak"));
       }
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
class BareaComputedProperty 
{
    constructor(getter, key, barea) {
      this.name=key;
      this.getter = getter;
      this.dirty = true;
      this.dependencyPaths = new Set();
      this.barea = barea;
      this.setDirty = (principalpath) => {
        this.dirty = true;
      };
    }
  
    track(dep, principalpath) {
      dep.addSubscriber(this.name, this.setDirty); //The computed property tells that tracker: Hi i'm a new subscriber
      this.dependencyPaths.add(principalpath);
    }
  
    get value() {
      if (this.dirty) 
      {
        dependencyTracker.start(this);
        this._value = this.getter.call(this.barea);
        dependencyTracker.stop();
        this.dirty = false;
      }
      return this._value;
    }
  }

  class BareaDependencyTracker 
  {
    constructor() {
      this.activeComputed = null;
      this.dependencies = new Map();
    }
  
    start(computed) {
      this.activeComputed = computed;
    }
  
    stop() {
      this.activeComputed = null;
    }

    deleteDynamicTemplateFunctions()
    {
        this.dependencies.forEach((childMap) => {
            childMap.subscribers.forEach((value, key) => {
              if (key.includes(META_DYN_TEMPLATE_FUNC_PREFIX)) {
                childMap.subscribers.delete(key); 
              }
            });
          });
    }

    isDepencencyPath(path, funcname)
    {
        if (!path)
            return false;
        if (!funcname)
            return false;

        if (!this.dependencies.has(path))
            return false;

        for (let childKey of this.dependencies.keys()) 
        {
            if (childKey!==path)
                continue;

            let childMap = this.dependencies.get(childKey); 
        
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

      if (this.activeComputed) {
          let dep = this.#getDependency(principalpath);
          this.activeComputed.track(dep, principalpath);
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
        let dep = this.dependencies.get(principalpath);
        if (!dep) {
            dep = this.#createDependency(principalpath);

            this.dependencies.set(principalpath, dep);
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
  
//Dependency tracker for computed properties
const dependencyTracker = new BareaDependencyTracker(); 
