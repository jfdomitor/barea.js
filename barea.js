/**
 * barea.js
 * 
 * Author: Johan Filipsson
 * Version: 1.0.0
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

// Special interpolation expressions
const INTERPOL_INDEX = 'index';


//Expression types
const EXPR_TYPE_PATH = 'path';
const EXPR_TYPE_HANDLER = 'handler';
const EXPR_TYPE_COMPUTED = 'computed';
const EXPR_TYPE_OBJREF = 'objref';
const EXPR_TYPE_OBJREF_PATH = 'objpath';
const EXPR_TYPE_OBJREF_EXPR = 'objexpr';
const EXPR_TYPE_EXPR = 'expr';


class BareaApp 
{

    #appElement; 
    #bareaId=0;
    #appDataProxy; 
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
                    this.#computedProperties[key] = new BareaComputedProperty(content.computed[key], this);
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
          
        const proxy = this.#createReactiveProxy((path, value, key) => 
        { 
            //Handles changes in the data and updates the dom

            let log = this.#getConsoleLog(1);
            if (log.active)
                console.log(log.name, path, value, key);

            this.#renderTemplates(key, path, value);
            this.#setupBindings(path);
            this.#applyProxyChangesToDOM(path, value);

        }, this.#appData);

        this.#appDataProxy = proxy;
  
        this.#buildDomDictionary();
        this.#renderTemplates();
        this.#setupBindings();
        this.#applyProxyChangesToDOM();

        if (this.#enableBareaId && ! this.#appDataProxy.hasOwnProperty('baId')) 
            this.#appDataProxy.baId = ++this.#bareaId;  // Assign a new unique ID

        if (this.#mountedHandler)   
            this.#mountedHandler.apply(this, [this.#appDataProxy]);
   
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
            return this.#appDataProxy; // Handle cases where regex fails

        let target = this.#appDataProxy;
    
        // Loop with for (faster than forEach)
        for (let i = 0; i < keys.length; i++) {
            if (i === 0 && keys[i].toLowerCase() === 'root') continue; // Skip 'root' only if it's the first key
            if (!target) return undefined; // Exit early if target becomes null/undefined
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
            return this.#appData; // Handle cases where regex fails

        let target = this.#appData;
    
        // Loop with for (faster than forEach)
        for (let i = 0; i < keys.length; i++) {
            if (i === 0 && keys[i].toLowerCase() === 'root') continue; // Skip 'root' only if it's the first key
            if (!target) return undefined; // Exit early if target becomes null/undefined
            target = target[keys[i]];
        }
    
        return target;
    }

    setPathData(data, path, value) {
        const keys = path.match(/[^.[\]]+/g); 
        if (!keys) 
            return false; 
    
        let target = data;
        for (let i = 0; i < keys.length - 1; i++) {

            if (i === 0 && keys[i].toLowerCase() === 'root') continue;
            
            const key = isNaN(keys[i]) ? keys[i] : Number(keys[i]); // Convert indexes to numbers
    
            // Check property existence WITHOUT triggering reactivity
            if (!Reflect.getOwnPropertyDescriptor(target, key)) {
                target[key] = isNaN(keys[i + 1]) ? {} : [];
            }
    
            target = Reflect.get(target, key); //Safe access
        }
    
        // Ensure only the exact property triggers reactivity
        const lastKey = isNaN(keys[keys.length - 1]) ? keys[keys.length - 1] : Number(keys[keys.length - 1]);
        return Reflect.set(target, lastKey, value); //Reactivity-safe set
    }


    #createReactiveProxy(callback, data, currentpath = "root") 
    {
        const handler = {
            get: (target, key) => {
                const value = target[key];
                const newPath = Array.isArray(target) ? `${currentpath}[${key}]` : `${currentpath}.${key}`;
              

                // If the value is already a proxy, return it as is to avoid recursive proxying
                if (value && value.__isProxy) {
                    return value;
                }

                if (this.#enableComputedProperties)
                    dependencyTracker.track(target, key);
               
                if (typeof value === 'object' && value !== null) 
                {
                    if (!Array.isArray(value) && this.#enableBareaId && !value.hasOwnProperty('baId')) 
                    {
                            value.baId = ++this.#bareaId;  
                    }

                    return this.#createReactiveProxy(callback, value, newPath); 

                }else{

                    if(typeof value === "function")
                    {
                        if (['push', 'pop', 'splice', 'shift', 'unshift'].includes(value.name)) 
                        {
                            return (...args) => {
                                const result = Array.prototype[value.name].apply(target, args);
                                callback(currentpath, target, key); // Trigger DOM update on array changes
                                return result;
                            };
                        }    
        
                    }
                }
              
                return value;
            },
            set: (target, key, value) => {

                if (target[key] === value) 
                    return true;
        
                target[key] = value;

                if (['length'].includes(key)) 
                    return true;

                if (this.#enableComputedProperties)
                    dependencyTracker.notify(target,key);

                const path = Array.isArray(target) ? `${currentpath}[${key}]` : `${currentpath}.${key}`;
                callback(path, value, key);
                return true;
            }
        };
        
        return new Proxy(data, handler);
    }
    
    #buildDomDictionary(tag = this.#appElement, templateId=-1)
    {
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
                    const exprtype = this.#getExpressionType(attr.value, attr.name);
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
                    else
                    {
                        //The user has given a boolean expression in the attribute
                        //We aim to convert it to a computed function

                        let condition = "";
                        if (expressions.length>1)
                            condition = expressions[1]
                        else
                            condition = expressions[0];

                        //Register boolean expression as a computed function
                        const boolfunc = function()
                        {
                            function  evaluateCondition(condition, context) {
                                try {
                                    return new Function("contextdata", `return ${condition};`)(context);
                                } catch (error) {
                                    console.error("Error evaluating condition:", error);
                                    return false;
                                }
                            }
                            
                            if (exprtype===EXPR_TYPE_EXPR)
                            {
                                condition=condition.replace('root.','contextdata.');
                                return evaluateCondition(condition, this.#appDataProxy);
                            }
                            else
                            {
                                //EXPR_TYPE_OBJREF_EXPR, example: show.showText===true
                                //TODO: get object from row, get objkeyname = show
                                //condition=condition.replace(objkeyname+'.','contextdata.');
                                //return evaluateCondition(condition, rowobject);
                            }
                        }

                        //Make up a functionname
                        this.baId++;
                        const funcname = `exprFunc_${this.#bareaId}`;
                        expressions.push(funcname);
                        this.#enableComputedProperties=true;
                        this.#computedProperties[funcname] = new BareaComputedProperty(boolfunc, this);
                        this.#computedKeys.push(funcname);
                        const odo = this.#createDomDictionaryObject(el,el.parentElement,null,attr.name,"", DIR_TYPE_BOOLEXPR, true,"","",templateId,expressions);
                        this.#domDictionary.push(odo);
                    }
                   
                  
                }

                if ([DIR_CLASS, DIR_IMAGE_SRC,DIR_HREF].includes(attr.name))
                {
                    if (!attr.value)
                        return;
                    if (this.#getExpressionType(attr.value, attr.name)==='INVALID')
                    {
                        console.error(`Then ${attr.name} directive has an invalid value (${attr.value}).`);
                        return;
                    }

                    if (attr.name===DIR_IMAGE_SRC && el.localName.toLowerCase()!=="img")
                        return;

                    const odo = this.#createDomDictionaryObject(el,el.parentElement,null,attr.name,attr.value, DIR_TYPE_UI_SETTER, true,"","",templateId,null);
                    this.#domDictionary.push(odo);
                    
                }

                if (DIR_BIND===attr.name)
                {
                    if (!attr.value)
                        return;
                    if (this.#getExpressionType(attr.value, DIR_BIND)==='INVALID')
                    {
                        console.error(`Then ${DIR_BIND} directive has an invalid (${attr.value}).`);
                        return;
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
  

    #setupBindings(path='root') 
    {

        let workscope = [];
        if (path.toLowerCase()=='root')
            workscope = this.#domDictionary.filter(p=> p.isnew && [DIR_TYPE_BINDING, DIR_TYPE_HANDLER].includes(p.directivetype));
        else
            workscope= this.#domDictionary.filter(p=> p.isnew && ((p.path.includes(path) && p.directivetype===DIR_TYPE_BINDING) || p.directivetype===DIR_TYPE_HANDLER));

    
        workscope.forEach(item => 
        {

            if (item.directive===DIR_BIND)
            {
                item.isnew = false;
                item.element.addEventListener("input", (event) => {

                    const path = item.path;
                    if (!path)
                        return;

                    let attribFuncDef = item.element.getAttribute(DIR_BIND_HANDLER);
                    if (attribFuncDef)
                    {
                        if (!(item.element._bareaObject && item.element._bareaKey))
                        {
                              //User created element
                            let objpath = this.#getSecondLastKeyFromPath(item.path);
                            item.element._bareaObject=this.getProxifiedPathData(objpath);
                            item.element._bareaKey=this.#getLastKeyFromPath(item.path);
                        }
                        else
                        {
                             //Template created element
                        }


                        attribFuncDef=attribFuncDef.trim();
                        let pieces = this.#parseFunctionCall(attribFuncDef);
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


                        //this.setPathData(this.#appDataProxy, path, item.element.checked);
                        item.element._bareaObject[item.element._bareaKey] =  item.element.checked;
                    } 
                    else if (item.element.type === "radio") 
                    {
                        if (log.active)
                            console.log(log.name, "type: " + item.element.type, "key: " + valuekey, "input value: " + item.element.value);

                        if (item.element.checked)
                            item.element._bareaObject[item.element._bareaKey] =  item.element.value;
                            //this.setPathData(this.#appDataProxy, path, item.element.value);
                    } 
                    else 
                    {
                        if (log.active)
                            console.log(log.name, "type: " + item.element.type, "key: " + valuekey, "input value: " + item.element.value);

                        item.element._bareaObject[item.element._bareaKey] =  item.element.value;
                        //this.setPathData(this.#appDataProxy, path, item.element.value);
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
  
                    if (!(item.element._bareaObject && item.element._bareaKey))
                    {
                        //User created element
                        let objpath = this.#getSecondLastKeyFromPath(item.path);
                        item.element._bareaObject=this.getProxifiedPathData(objpath);
                        item.element._bareaKey=this.#getLastKeyFromPath(item.path);
                    }
                    else
                    {
                             //Template created element
                    }

                    let allparams = [event,item.element, item.element._bareaObject];
                    let pieces = this.#parseFunctionCall(attribFuncDef);
                    allparams.push(...pieces.params);

                    // Call the function from the handlers object
                    if (this.#methods[pieces.functionName]) {
                        this.#methods[pieces.functionName].apply(this, allparams);
                    } else {
                        console.warn(`Handler function '${pieces.functionName}' not found.`);
                    }
                });
  
            }

        });
    
    }

    #renderTemplates(operation='init', path='root') 
    {

        let foreacharray = [];
  
        //throw new Error('renderTemplates was called with an object in the array');
        //Also occurs on ba-bind to an object in the array
        if (path.includes('['))
            return; 

        let isSinglePush = operation === "push";
        let templates = [];
        if (path.toLowerCase()==='root')
            templates = this.#domDictionary.filter(p=> p.directivetype===DIR_TYPE_TEMPLATE);
        else
            templates = this.#domDictionary.filter(p=> p.path.includes(path) && p.directivetype===DIR_TYPE_TEMPLATE);

        templates.forEach(template => {

            let [varname, datapath] = template.path.split(" in ").map(s => s.trim());
            if (!varname)
                throw new Error(`No variable name was found in the ${DIR_FOREACH} expression`);

            if (this.#getExpressionType(datapath, DIR_FOREACH)===EXPR_TYPE_COMPUTED)
            {
                let pieces = this.#parseFunctionCall(datapath);
                if (pieces.functionName)
                {
                    foreacharray = this.#computedProperties[pieces.functionName].value;
                }
                else
                {
                    console.warn(`Could not find computed function name in the ${DIR_FOREACH} directive`);
                }
            }
            else
            {
                foreacharray = this.getPathData(datapath); 
            }
            
            if (!Array.isArray(foreacharray))
                return; //throw new Error('renderTemplates could not get array, ' + path);

           if ((foreacharray.length - template.element.children.length) !== 1)
                isSinglePush=false;

           let counter=0;
            if (!isSinglePush)
            {
                this.#removeTemplateChildrenFromDomDictionary(template.id);
                template.parentelement.innerHTML = ""; // Clear list
            }
            else
            {
                counter = foreacharray.length-1;
                foreacharray = foreacharray.slice(-1);
            }

            const fragment = document.createDocumentFragment();

            foreacharray.forEach(item => {
                const newtag = document.createElement(template.templateTagName);
              
                newtag.innerHTML = template.templateMarkup;
                newtag.setAttribute(META_ARRAY_VARNAME, varname);
                //newtag.setAttribute(META_PATH, `${datapath}[${counter}]`);
                newtag.setAttribute(META_ARRAY_INDEX, counter);
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
                    // el.setAttribute(META_PATH, `${datapath}[${counter}]`);
                    el.setAttribute(META_ARRAY_INDEX, counter);

                    if (el.hasAttribute(DIR_IF)) {
                        // let attrib = el.getAttribute(DIR_IF);
                        // if (!this.#isValidHandlerName(attrib))
                        // {
                        //     if (!attrib.includes(varname + '.'))
                        //         console.warn(`The ${DIR_IF} expression ${attrib} used in an element under ${DIR_FOREACH} does not match the ${DIR_FOREACH} expression, should reference '${varname}'.`);
                        // }
                    }
                    if (el.hasAttribute(DIR_CLASS_IF)) {
                        // let attrib = el.getAttribute(DIR_CLASS_IF);
                        // if (!this.#isValidHandlerName(attrib))
                        // {
                        //     if (!attrib.includes(varname + '.'))
                        //         console.warn(`The ${DIR_CLASS_IF} expression ${attrib} used in an element under ${DIR_FOREACH} does not match the ${DIR_FOREACH} expression, should reference '${varname}'.`);
                        // }
                    }
                    if (el.hasAttribute(DIR_HIDE)) {
                        // let attrib = el.getAttribute(DIR_HIDE);
                        // if (!this.#isValidHandlerName(attrib))
                        // {
                        //     if (!attrib.includes(varname + '.'))
                        //         console.warn(`The ${DIR_HIDE} expression ${attrib} used in an element under ${DIR_FOREACH} does not match the ${DIR_FOREACH} expression, should reference '${varname}'.`);
                        // }
                    }
                    if (el.hasAttribute(DIR_SHOW)) {
                        // let attrib = el.getAttribute(DIR_SHOW);
                        // if (!this.#isValidHandlerName(attrib))
                        // {
                        //     if (!attrib.includes(varname + '.'))
                        //         console.warn(`The ${DIR_SHOW} expression ${attrib} used in an element under ${DIR_FOREACH} does not match the ${DIR_FOREACH} expression, should reference '${varname}'.`);
                        // }
                    }
                    if (el.hasAttribute(DIR_BIND)) {
                        let attrib = el.getAttribute(DIR_BIND);
                        if (!attrib.includes(varname + '.'))
                            console.warn(`The ${DIR_BIND} expression ${attrib} used in an element under ${DIR_FOREACH} does not match the ${DIR_FOREACH} expression, should reference '${varname}'.`);
                    
                        el._bareaKey=this.#getLastKeyFromPath(attrib);
                    }
                   
                    
                });

                this.#buildDomDictionary(newtag, template.id);

                counter++;

            });

            if (fragment.childElementCount>0)
                template.parentelement.appendChild(fragment);
           
        });    
    }

  
    #applyProxyChangesToDOM(path='root', value=this.#appDataProxy) 
    {
    
        //console.log(path, value);
        function interpolate(instance)
        {
            const interpolations = instance.#domDictionary.filter(p=>p.directive===DIR_INTERPOLATION);
            interpolations.forEach(t=>
            {
                let count=0;
                let content= t.templateMarkup;
                t.expressions.forEach(expr=> 
                {
                    //Just to speed up
                    //If primitive (path), example : root.model.user.firstname
                    //Only interpolate root, root.model, root.model.user, root.model.user.firstname
                    if (instance.#isPrimitive(value) && expr.includes('root'))
                    {
                        if (!path.includes(expr))
                            return;
                    }

                    let exprvalue = null;
                    let exprtype = instance.#getExpressionType(expr, DIR_INTERPOLATION);
                    if (exprtype===EXPR_TYPE_COMPUTED){
                        exprvalue=instance.#computedProperties[expr].value;
                    }else if (exprtype===EXPR_TYPE_PATH){
                        exprvalue = instance.getPathData(expr);
                    }else if (exprtype===EXPR_TYPE_OBJREF){
                        exprvalue = instance.#getClosestBareaObject(t.element);
                    }
                    else if (exprtype===EXPR_TYPE_OBJREF_PATH){
                        let subobj = instance.#getClosestBareaObject(t.element);
                        let key =  instance.#getLastKeyFromPath(expr);
                        exprvalue = subobj[key];
                    }
                    else if (expr === INTERPOL_INDEX)
                    {
                        exprvalue = instance.#getClosestAttribute(t.element, META_ARRAY_INDEX);
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

       
        function updateElements(path, value, instance)
        {
                //Computed handlers get cashed value (updates when used by other, become dirty)
                const computedfuncs = instance.#domDictionary.filter(p=> p.directivetype === DIR_TYPE_COMPUTED);
                computedfuncs.forEach(t=>
                {
                  
                    let attribFuncDef = t.expressions[0];
                    let boundvalue = false;
                    attribFuncDef=attribFuncDef.trim();
                    if (instance.#computedProperties[attribFuncDef]) {
                            boundvalue = instance.#computedProperties[attribFuncDef].value;
                    } else {
                        console.warn(`Computed boolean handler '${pattribFuncDef}' not found.`);
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
                const boolexpr = instance.#domDictionary.filter(p=> p.directivetype === DIR_TYPE_BOOLEXPR);
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
                    if (instance.#computedProperties[funcname]) {
                        boundvalue = instance.#computedProperties[funcname].value;
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

                const bareabind = instance.#domDictionary.filter(p=>p.directive===DIR_BIND && ((instance.#isPrimitive(value) && (p.path===path)) || (!instance.#isPrimitive(value) && (p.path!==""))));
                bareabind.forEach(t=>
                {
                    let boundvalue = value;
                    if (bareabind.length> 1 || !instance.#isPrimitive(boundvalue)){
                        if (instance.#getExpressionType(t.path, DIR_BIND)===EXPR_TYPE_PATH)
                        {

                        }
                        else if (instance.#getExpressionType(t.path, DIR_BIND)===EXPR_TYPE_OBJREF_PATH)
                        {

                        }
                    }
                    /*
                    boundvalue = instance.getPathData(t.path);
                    let attribFuncDef = t.element.getAttribute(DIR_BIND_HANDLER);
                    if (attribFuncDef)
                    {
                        attribFuncDef=attribFuncDef.trim();
                        if (instance.#getExpressionType(attribFuncDef, DIR_BIND_HANDLER)==="INVALID")
                            return;
                     
                        let pieces = instance.#parseFunctionCall(attribFuncDef);
                        let allparams = [VERB_SET_UI, t.element, boundvalue];
                        allparams.push(...pieces.params);

                        if (instance.#methods[pieces.functionName]) {
                            instance.#methods[pieces.functionName].apply(instance, allparams);
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
                            boundvalue="";

                        if (t.element.value !== boundvalue) 
                        {
                            t.element.value = boundvalue;
                        }
                    }       
                        */              
                });

/*
                
                const bareaclass = instance.#domDictionary.filter(p=>p.directive===DIR_CLASS && p.directivetype===DIR_TYPE_UI_SETTER && ((instance.#isPrimitive(value) && (p.path===path)) || (!instance.#isPrimitive(value) && (p.path!==""))));
                bareaclass.forEach(t=>
                {
                    let boundvalue = value;
                    if (bareaclass.length> 1  || !instance.#isPrimitive(boundvalue))
                        boundvalue = instance.getPathData(t.path);

                    if (boundvalue.includes(','))
                        boundvalue = boundvalue.replaceAll(',', ' ');

                    t.element.className = boundvalue || "";
            
                });

                const bareaimgsrc = instance.#domDictionary.filter(p=>p.directive===DIR_IMAGE_SRC && p.directivetype===DIR_TYPE_UI_SETTER && ((instance.#isPrimitive(value) && (p.path===path)) || (!instance.#isPrimitive(value) && (p.path!==""))));
                bareaimgsrc.forEach(t=>
                {
                    let boundvalue = value;
                    if (bareaimgsrc.length> 1  || !instance.#isPrimitive(boundvalue))
                        boundvalue = instance.getPathData(t.path);

                    if (boundvalue)
                    {
                        t.element.src = boundvalue;
                    }
            
                });

                const bahref = instance.#domDictionary.filter(p=>p.directive===DIR_HREF && p.directivetype===DIR_TYPE_UI_SETTER && ((instance.#isPrimitive(value) && (p.path===path)) || (!instance.#isPrimitive(value) && (p.path!==""))));
                bahref.forEach(t=>
                {
                    let boundvalue = value;
                    if (bareaimgsrc.length> 1  || !instance.#isPrimitive(boundvalue))
                        boundvalue = instance.getPathData(t.path);

                    if (boundvalue)
                    {
                        t.element.href = boundvalue;
                    }
            
                });
*/
           
        }

        /****** Interpolation ******/
        interpolate(this);
       
        /******* Element boinding ******/
        updateElements(path,value,this);

    }

    /*** Internal Helpers ***/
    #getLastKeyFromPath(path)
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

    #getSecondLastKeyFromPath(path)
    {
        if (!path)
            return 'root';

        let keys = path.split('.');
        if (keys.length>=2)
            return keys[keys.length-2];

        return 'root';
    }

    #parseFunctionCall(str) {

         // Convert string values to correct types
        function convertValue(val) {
            if (/^'.*'$|^".*"$/.test(val)) {
                return val.slice(1, -1); // Remove quotes for strings
            }
            if (val === "true") return true;
            if (val === "false") return false;
            if (val === "null") return null;
            if (!isNaN(val)) {
                return val.includes(".") ? parseFloat(val) : parseInt(val, 10); // Convert numbers
            }
            if (/^\[.*\]$/.test(val)) {
                return val.slice(1, -1).split(',').map(item => convertValue(item.trim())); // Convert array elements
            }
            return val; // Keep as a string
        }

        const match = str.match(/^(\w+)\((.*)\)$/);
        if (!match) return null; // Invalid format
    
        const functionName = match[1]; // Extract function name
        const paramsString = match[2].trim(); // Extract parameters
    
        // If paramsString is empty (e.g., `sayHello()`), return an empty array
        if (paramsString === "") return { functionName, params: [] };
    
        // Regex to split parameters correctly while keeping quoted values intact
        const params = [...paramsString.matchAll(/'[^']*'|"[^"]*"|[^,]+/g)]
            .map(match => convertValue(match[0].trim())); // Convert each value properly
    
        return { functionName, params };
    }
    
    #getExpressionType(expression, directive) 
    {
        if ([DIR_CLASS, DIR_BIND, DIR_IMAGE_SRC, DIR_HREF].includes(directive))
        {
            if (expression.includes('(') || expression.includes(')'))
                return "INVALID";

            if (!(expression.includes('.')))
                return "INVALID";

            if (expression.toLowerCase().startsWith('root.'))
                return EXPR_TYPE_PATH;

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
                return EXPR_TYPE_EXPR;

            if (!(expression.includes('.')))
                return EXPR_TYPE_COMPUTED;
  
            return EXPR_TYPE_OBJREF_EXPR;
        }

        if (directive === DIR_FOREACH)
        {
            if ((expression.includes('root.')))
                return EXPR_TYPE_PATH;

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
                return EXPR_TYPE_PATH;

            if (expression.includes('.'))
                return EXPR_TYPE_OBJREF_PATH;

            if (this.#computedKeys.includes(expression))
                return EXPR_TYPE_COMPUTED;

            return EXPR_TYPE_OBJREF;
        }

      
       return "INVALID";

    }
    
    #hasAnyChar(str, chars) {
        return chars.some(char => str.includes(char));
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
            {id: 4, name: "Build dom dictionary: ", active:false}
        ];
    } 

    #getConsoleLog(id) 
    {
        const log = this.#consoleLogs.find(log => log.id === id);
        if (!log)
            return {id:-1, name:"", active:false};
        return log;
    }

  
                   
    /* Dom Handler */
    #loadedHandler =  (event) => {
       if (this.#enableHideUnloaded)
       {
            document.querySelectorAll(".ba-cloak").forEach(el => el.classList.remove("ba-cloak"));
       }
    }
   
}

class BareaComputedProperty 
{
    constructor(getter, barea) {
      this.getter = getter;
      this.dirty = true;
      this.dependencies = new Set();
      this.barea = barea;
      this.setDirty = () => {
        this.dirty = true;
      };
    }
  
    track(dep) {
      dep.addSubscriber(this.setDirty);
      this.dependencies.add(dep);
    }
  
    get value() {
      if (this.dirty) {
        // Automatically track dependencies
        dependencyTracker.start(this);
        this._value = this.getter.call(this.barea);
        dependencyTracker.stop();
        this.dirty = false;
      }
      return this._value;
    }
  }

  class BareaDependencyTracker {
    constructor() {
      this.activeComputed = null;
      this.dependencies = new WeakMap();
    }
  
    start(computed) {
      this.activeComputed = computed;
    }
  
    stop() {
      this.activeComputed = null;
    }
  
    track(target, key) 
    {
      if (this.activeComputed) {
          let dep = this.#getDependency(target, key);
          this.activeComputed.track(dep);
      }
    }

    notify(target, key) 
    {
       let dep = this.#getDependency(target, key);
       if (dep)
          dep.notify();
    }

    #getDependency(target, key) {
        let depsForTarget = this.dependencies.get(target);
        if (!depsForTarget) {
            depsForTarget = new Map();
            this.dependencies.set(target, depsForTarget);
        }

        let dep = depsForTarget.get(key);
        if (!dep) {
            dep = this.#createDependency();
            depsForTarget.set(key, dep);
        }

        return dep;
    }

    #createDependency() {
        let subscribers = new Set();
        return {
            addSubscriber(set_dirty_func) {
                subscribers.add(set_dirty_func);
            },
            notify() {
                subscribers.forEach(set_dirty_func => set_dirty_func());
            }
        };
    }

  }
  

  
//For computed properties
const dependencyTracker = new BareaDependencyTracker(); 

