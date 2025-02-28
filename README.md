# barea.js
barea.js (Basic Reactivity) is a small reactive java script heavy influenced by vue.js and angular.js (before they became huge frameworks).
No dependencies just raw reactivity. 

# What about it

* Using proxies to react on data changes, like vue3
* Super light, around than 40Kb unminified
* Fast
* No dependencies to other libs
* Computed properties with automatic dependency tracking

# Install
```
npm install barea.js
```

# Setup

```
<div id="app"> 
<!-- Your app markup --> 
</div>

<script src="../barea.js"></script>
<script>
const bareaapp = getBareaApp();

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
