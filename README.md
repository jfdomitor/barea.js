# barea.js
barea.js (Basic Reactivity) is a small reactive java script heavy influenced by vue.js and angular.js (before they became huge frameworks).
No dependencies just raw reactivity. 

# What about it

* Using proxies to react on data changes, like vue3
* Super light, around than 40Kb unminified
* Fast
* No dependencies to other libs
* Computed properties with automatic dependency tracking
* UI dependency tracking that only update/rerender UI elements when needed

# Install
```
npm install barea.js
```

# Setup

```
<div id="app"> 
<!-- Your app markup --> 
</div>


<script type="module">

 import {BareaApp,BareaViewState,BareaDataModel,BareaHelper} from '/barea.js';

    //BareaHelper.printDebugLogs();
    //BareaHelper.enableDebugLog(10);

    //Barea app element
     const appElement = document.getElementById("app");

    const bareaapp = new BareaApp();

    const appcontent = {
      data: {
        model: { name:"Johnny Barea" }
      },
      methods:
      {
        someHandler: function(event, arg1, arg2, arg3, arg4, arg5, arg6)
        {
          //Do something
        }
      },
      computed:
      {
        someComputedProperty: function()
        {
          //get some data, or calculate something nice
        }
      },
      mounted: function(data) 
      {
            data.model = getSomeData();
      }
  };

  bareaapp.mount("app",appcontent);
</script>
```

* Directive: ba-bind
```
<input type="text" ba-bind="root.model.user.firstname">
Bind ui controls to a single value in the model
```
* Directive: ba-bind-handler
```
<input type="text" ba-bind="root.model.somedata" ba-bind-handler="someDataHandler()">
Override binding logic for complex ui controls, by implementing a function that updates data/ui when the bound value changes.
```
* Directive: ba-click
```
<button ba-click="saveMyData('arg1', 'arg2')" ba-path="root.model">
Run functions that do some fun
```
* Directive: ba-foreach
```
<tr ba-foreach="show in root.model.shows">
  <td><input type="text" ba-bind="show.Note"></td>
</tr>
A template directive to create new html based on an array in your model, works only on arrays in your model
or computed properties that returns an array
```
* Directive: ba-class
```
<div ba-class="root.settings.myDivClasses" ></div>
Set class names in your data and have them reflected in the dom.
```
* Directive: ba-class-if
```
<div ba-class-if="root.somevalue==='hey ho'?class1,class2,class3" ></div>
<div ba-class-if="someComputedProperty?class1,class2,class3" ></div>
Set class names in your data based on computed properties or expressions and have them reflected in the dom.
```
* Directive: ba-hide
```
<p ba-hide="root.model.somevalue" ></p>
Show / Hide an element based on an expression

<div ba-hide="someComputedProperty" ></div>
Show / Hide an element based on a computed property
```
* Directive: ba-show
```
<p ba-show="root.model.somevalue" ></p>
Show / Hide an element based on an expression

<div ba-show="someComputedProperty" ></div>
Show / Hide an element based on a computed property
```
* Directive: ba-if
```
<p ba-if="root.showText" ></p>
Add / Remove elements based on an expression

<div ba-if="showText" ></div>
Add / Remove elements based on a computed property
```
* Directive: ba-src
```
Show images based on urls in your model
```
* Directive: ba-path
```
Use this together with handlers (ba-if, ba-show etc..) to have data at a certain path sent as an event parameter
```
* Directive: ba-href
```
Use this to set the href attribute from your data
```
* Interpolation
```
Examples:
{{root.model}}, {{root.model.array}}, {{root.model.somevalue}}
```
* Check out the file examples/index.html
```
Tip: run examples/index.html with vs code live server to explore all directives and functions
```

# In Depth (Key Factors)

* Operates only on the app node where Barea.js is mounted.
* Proxies objects on get, ensuring that all mounted objects are always proxied.
* UI Dependency Tracking: Directive objects are created, linked to both data and DOM elements, and stored in a UIDependencyTracker, which is notified when data changes. This ensures that only the relevant directives are updated.
* Computed Property Dependency Tracking: Tracking is based on the principle path (e.g., root.model.users.user), meaning a computed property is linked to all paths involved in calculating its value. If a directive uses a computed property, its directive object will also be linked to the computed property. This ensures that all related directives update when the property becomes dirty (i.e., needs recalculation). Only changes to data will trigger a dependent computed property. An array function cannot be the trigger, this is by design. Also rememeber to never edit data inside a computed property.
  
Example:
Works fine, nothing edited here
```
fullName: function()
{
  let model = this.getData();
  return model.firstName + '  ' + model.lastName;
}
```
An infinity loop might occur since fullName is dependent on firstName (and lastName) and becomes dirty every time one of them changes.
If there's a directive connected to fullName it will be notified to update every time fullName get's dirty.
1. fullName gets dirty 
2. Directive(s) is notified and retrievs the value of fullName.
3. fullName is recomputed and since there's an edit of a dependency inside it will get dirty again
4. The process starts over at (2)
```
fullName: function()
{
  let model = this.getData();
  model.firstName = 'Sonny';
  return model.firstName + '  ' + model.lastName;
}
```
* Expressions: For the directives: **ba-if, ba-class-if, ba-hide and ba-show** it's possible to give either an expression or a predifined computed function. All expressions are converted into computed properties by running a dynamicly created function that acts as the getter of the computed property.
* Templates: When rendering a template, new markup is generated, and these elements are added to both UI Dependency Tracking and Computed Property Dependency Tracking, just as during initial mounting. The generated markup is then managed in the same way as initially loaded data.
* Avoid declaring too many computed functions or expressions directly in template markup, as this can significantly impact performance. If you load 1,000 rows, each containing multiple expressions or computed functions, the system may have to evaluate up to:
1,000 × (number of expressions or functions per row). This can cause unnecessary re-renders and slow down the application.

Example Scenario:
Consider a template where each item conditionally displays data using a computed function or expression:

```
<div ba-show="root.edit">
    <!-- Template content -->
</div>
```
If root.edit is used in every template item, the function or expression linked to it will evaluate 1,000 times—once for each row, but will only execute the getter the computed propery the first time.

