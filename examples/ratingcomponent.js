

getRatingBar = function (path, handlername)
{
    const markup = `<div class="star-rating" ba-bind="${path}" ba-bind-handler="${handlername}">
            <input type="checkbox" id="star1" name="rating" value="1" >
            <label for="star1"></label>
            <input type="checkbox" id="star2" name="rating" value="2" >
            <label for="star2"></label>
            <input type="checkbox" id="star3" name="rating" value="3" >
            <label for="star3"></label>
            <input type="checkbox" id="star4" name="rating" value="4" >
            <label for="star4"></label>
            <input type="checkbox" id="star5" name="rating" value="5" >
            <label for="star5"></label>
        </div>`;

    return markup;
}

getRatingHandler = function(verb, element, data) 
{
    if (verb === 'SET_DATA')
    {
        let checkboxes = element.querySelectorAll('input[type="checkbox"]');
        let points = 0;
        checkboxes.forEach(checkbox => {
        if (checkbox.checked) 
            points = checkbox.value;
        });

        data.Rating = points;
    }
    if (verb === 'SET_UI')
    {
        let checkboxes = element.querySelectorAll('input[type="checkbox"]');
        let index = 1;
        checkboxes.forEach(checkbox => {
        checkbox.checked=false;
        if (index<= data)
                checkbox.checked=true;
            
            index++;
        });
    }         
};