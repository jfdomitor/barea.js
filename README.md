# barea.js
barea.js (Basic Reactivity) is a small reactive java script heavy influenced by vue.js and angular.js (before they became huge frameworks). The intended audience is server rended pages that need an easy way to manage ui bindings and tweaks. No dependencies just raw reactivity.

# What about it

* Using proxies to react on data changes, like vue3
* Super light, around than 40Kb unminified
* Fast
* No dependencies to other libs
* Directive: ba-bind
```
<input type="text" ba-bind="root.model.user.firstname">
Bind ui controls to a single value in the model
```
* Directive: ba-bind-handler
```
<input type="text" ba-bind="root.model.somedata" ba-bind-handler="someDataHandler">
Override binding logic for complex ui controls, by implementing a function that updates data/ui when the bound value changes.
```
* Directive: ba-click
```
<button ba-click="saveMyData" ba-path="root.model">
Run functions
```
* Directive: ba-foreach
```
<tr ba-foreach="show in root.model.shows">
  <td><input type="text" ba-bind="show.Note"></td>
</tr>
A template directive to create new html based on an array in your model, works only on arrays
```
* Directive: ba-class
```
<div ba-class="root.settings.myDivClasses" ></div>
Set class names in your data and have them reflected in the dom.
```
* Directive: ba-hide
```
<p ba-hide="root.model.somevalue" ></p>
Show / Hide an element when changing a boolean value in the model

<div ba-hide="someHandler" ></div>
Show / Hide an element based on a boolean function called when ever the model changes
```
* Directive: ba-show
```
<p ba-show="root.model.somevalue" ></p>
Show / Hide an element when changing a boolean value in the model

<div ba-show="someHandler" ></div>
Show / Hide an element based on a boolean function called when ever the model changes
```
* Directive: ba-if
```
<p ba-if="root.showText" ></p>
Add / Remove elements when changing a boolean value in the model

<div ba-if="showTextHandler" ></div>
Add / Remove elements based on a boolean function called when ever the model changes
```
* Directive: ba-img-src
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
